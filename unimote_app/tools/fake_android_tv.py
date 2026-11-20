#!/usr/bin/env python3
"""A pretend Android TV / Google TV for testing Unimote without a TV.

Speaks the Android TV Remote v2 protocol: pairing on port 6467 (prints a code), remote control on 6466.
Prints every key it receives and, with --keys-file, appends them to a file. Needs:
    pip install androidtvremote2 cryptography pyopenssl

    python3 tools/fake_android_tv.py [--pair-port 6467] [--api-port 6466] [--code-file F] [--keys-file F]

On the Android emulator the host is 10.0.2.2. Development tool only: it accepts any client that pairs.
"""
import argparse, hashlib, secrets, socket, sys, threading, time
from OpenSSL import SSL, crypto
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from google.protobuf.internal.encoder import _EncodeVarint
from androidtvremote2 import polo_pb2 as polo, remotemessage_pb2 as rm
from androidtvremote2.certificate_generator import generate_selfsigned_cert

paired = set()  # DER certificates of clients that finished pairing
args = None


def frame(msg):
    body = msg.SerializeToString()
    out = bytearray()
    _EncodeVarint(out.extend, len(body))
    return bytes(out) + body


def recv_exact(conn, n):
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("closed")
        buf += chunk
    return buf


def read_frame(conn):
    shift, length = 0, 0
    while True:
        b = recv_exact(conn, 1)[0]
        length |= (b & 0x7F) << shift
        if not b & 0x80:
            break
        shift += 7
    return recv_exact(conn, length)


def be(v):
    return v.to_bytes((v.bit_length() + 7) // 8, "big")


def nums(der):
    pn = x509.load_der_x509_certificate(der).public_key().public_numbers()
    return be(pn.n) + be(pn.e)


def peer_der(conn):
    return conn.get_peer_certificate().to_cryptography().public_bytes(serialization.Encoding.DER)


def ok_msg():
    return polo.OuterMessage(protocol_version=2, status=polo.OuterMessage.STATUS_OK)


def pairing(conn, server_der):
    client_der = peer_der(conn)
    keys = nums(client_der) + nums(server_der)
    suffix = secrets.token_hex(2).upper()
    code = f"{hashlib.sha256(keys + bytes.fromhex(suffix)).digest()[0]:02X}{suffix}"
    while True:
        msg = polo.OuterMessage.FromString(read_frame(conn))
        reply = ok_msg()
        if msg.HasField("pairing_request"):
            print(f"[pairing] request from {msg.pairing_request.client_name!r} service={msg.pairing_request.service_name!r}", flush=True)
            reply.pairing_request_ack.server_name = "Fake Android TV"
        elif msg.HasField("options"):
            reply.options.preferred_role = polo.Options.ROLE_TYPE_OUTPUT
            e = reply.options.input_encodings.add()
            e.type, e.symbol_length = polo.Options.Encoding.ENCODING_TYPE_HEXADECIMAL, 6
        elif msg.HasField("configuration"):
            reply.configuration_ack.SetInParent()
            conn.sendall(frame(reply))
            print(f"[pairing] CODE ON TV SCREEN: {code}", flush=True)
            if args.code_file:
                open(args.code_file, "w").write(code)
            continue
        elif msg.HasField("secret"):
            want = hashlib.sha256(keys + bytes.fromhex(code[2:])).digest()
            if msg.secret.secret != want:
                reply.status = polo.OuterMessage.STATUS_BAD_SECRET
                print("[pairing] wrong secret", flush=True)
            else:
                reply.secret_ack.secret = want
                paired.add(client_der)
                print("[pairing] PAIRED", flush=True)
        else:
            return
        conn.sendall(frame(reply))


def remote(conn):
    if peer_der(conn) not in paired:
        print("[remote] refused: client is not paired", flush=True)
        return
    lock = threading.Lock()
    def send(m):
        with lock:
            conn.sendall(frame(m))
    m = rm.RemoteMessage()
    c = m.remote_configure
    c.code1 = 611
    c.device_info.model, c.device_info.vendor, c.device_info.unknown1, c.device_info.unknown2 = "Fake TV", "Unimote", 1, "1"
    c.device_info.package_name, c.device_info.app_version = "fake", "1.0"
    send(m)
    alive = True
    def pinger():
        n = 0
        while alive:
            time.sleep(5)
            n += 1
            p = rm.RemoteMessage(); p.remote_ping_request.val1 = n
            try: send(p)
            except Exception: return
    threading.Thread(target=pinger, daemon=True).start()
    try:
        while True:
            msg = rm.RemoteMessage.FromString(read_frame(conn))
            if msg.HasField("remote_configure"):
                a = rm.RemoteMessage(); a.remote_set_active.active = 611; send(a)
                print(f"[remote] client configured, features={msg.remote_configure.code1}", flush=True)
            elif msg.HasField("remote_set_active"):
                st = rm.RemoteMessage(); st.remote_start.started = True; send(st)
                print("[remote] ready", flush=True)
            elif msg.HasField("remote_ping_response"):
                print(f"[remote] pong {msg.remote_ping_response.val1}", flush=True)
            elif msg.HasField("remote_key_inject"):
                k = msg.remote_key_inject
                line = f"{rm.RemoteKeyCode.Name(k.key_code)} {rm.RemoteDirection.Name(k.direction)}"
                print(f"[remote] KEY {line}", flush=True)
                if args.keys_file:
                    open(args.keys_file, "a").write(line + "\n")
    finally:
        alive = False


def serve(port, handler, ctx, server_der):
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((args.host, port)); s.listen(5)
    def one(raw):
        conn = SSL.Connection(ctx, raw)
        try:
            conn.set_accept_state(); conn.do_handshake()
            handler(conn, server_der) if handler is pairing else handler(conn)
        except Exception as e:
            print(f"[port {port}] connection ended: {e.__class__.__name__} {e}", flush=True)
        finally:
            try: raw.close()
            except Exception: pass
    while True:
        raw, _ = s.accept()
        threading.Thread(target=one, args=(raw,), daemon=True).start()


def main():
    global args
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair-port", type=int, default=6467)
    ap.add_argument("--api-port", type=int, default=6466)
    ap.add_argument("--code-file"); ap.add_argument("--keys-file")
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    cert_pem, key_pem = generate_selfsigned_cert("fake-android-tv")
    server_der = x509.load_pem_x509_certificate(cert_pem).public_bytes(serialization.Encoding.DER)
    ctx = SSL.Context(SSL.TLS_SERVER_METHOD)
    ctx.use_certificate(crypto.load_certificate(crypto.FILETYPE_PEM, cert_pem))
    ctx.use_privatekey(crypto.load_privatekey(crypto.FILETYPE_PEM, key_pem))
    ctx.set_verify(SSL.VERIFY_PEER, lambda *a: True)  # like a real TV: request a client certificate, accept any
    threading.Thread(target=serve, args=(args.api_port, remote, ctx, server_der), daemon=True).start()
    print(f"Fake Android TV listening: pairing {args.pair_port}, remote {args.api_port}", flush=True)
    serve(args.pair_port, pairing, ctx, server_der)


if __name__ == "__main__":
    main()

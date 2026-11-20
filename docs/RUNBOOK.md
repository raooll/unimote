# Unimote runbook

Monorepo: `dashboard/` (Rails 8: JSON API, ActiveAdmin, later the website) and `unimote_app/` (React Native, Android first).

## 1. Run it locally

```bash
# API + admin
cd dashboard
bin/rails db:setup            # creates DBs, runs migrations, imports the catalog, creates the DEV admin
bin/rails server              # http://localhost:3000
#   /admin        ActiveAdmin  (dev login admin@example.com / password — dev seed only)
#   /admin/jobs   Solid Queue dashboard (admin only)
#   /api-docs     Swagger UI   (source: dashboard/swagger/v1/openapi.yaml)
bundle exec rspec             # 47 specs; includes a check that every route is documented in the OpenAPI file

# App
cd unimote_app
yarn install
yarn start                    # Metro
yarn android                  # emulator reaches the host at http://10.0.2.2:3000 (Settings → Developer to change)
yarn test && yarn typecheck
cd android && ./gradlew :app:testDebugUnitTest    # Kotlin unit tests
```

## 2. Catalog data (what users pick brands/models from)

The catalog is category → brand → model → remote config. It ships to production as a snapshot, not as seeds.

| Task | Command |
| --- | --- |
| Import Flipper-IRDB (CC0) into your DB | `bin/rails "catalog:import_flipper[/path/to/Flipper-IRDB]"` (optional 2nd arg limits to a folder, e.g. `TVs`) |
| Hand-written Wi-Fi/Bluetooth/BLE profiles | `bin/rails catalog:profiles` |
| Write the snapshot | `bin/rails catalog:export` → `db/data/catalog.ndjson.gz` (~1.1 MB, commit it) |
| **Load it on production** | `bin/rails catalog:import` (idempotent; ~9 s) |
| Fresh environment, all in one | `bin/rails catalog:seed` (categories + snapshot + profiles) |

Rules the importer follows, so re-running it is always safe:
* It never overwrites live `popularity`, `success_count`/`failure_count`, or an admin's publish/unpublish decision.
* A remote whose signals changed gets its `version` bumped, so apps re-download it.
* New remotes from Flipper-IRDB are imported as published; hand-written profiles that are unverified on hardware are `draft` (publish them in ActiveAdmin once tested).

Typical production deploy of new data: run `catalog:import_flipper` + `catalog:export` on a dev machine, review in ActiveAdmin, commit the snapshot, deploy, run `catalog:import`.

## 3. API

Interactive docs at `/api-docs`. Summary:

* **No login needed:** categories, brands, models, `GET /remotes/match`, `GET /remotes/:id` (ETag), `POST /remotes/:id/reports`, `POST /submissions`, layouts, health. Guests identify themselves with an `X-Install-Id` header (used for rate limiting and attribution only).
* **Optional account:** `/auth/sign_up|sign_in|sign_out|password`, `/me` (GET/PATCH/DELETE = account deletion). Mobile auth is a JWT (`Authorization: Bearer`), revoked on sign-out.
* **Cloud sync (login required):** `POST /sync` merges everything from a device and returns the account snapshot; `PUT|DELETE /rooms|saved_remotes|scenes/:client_uuid` for single items. Items are keyed by a client-generated UUID so they can be created offline.

Production checklist: set `SECRET_KEY_BASE`/credentials, `DATABASE_URL`, `CORS_ORIGINS`, `APP_LINK_BASE` (password-reset deep link), run a Solid Queue worker (`SOLID_QUEUE_IN_PUMA=1` or a separate process) so reset emails are sent, and change/remove the dev admin seed.

## 4. App architecture

* `src/api` typed client · `src/store` zustand + AsyncStorage (works fully offline and as a guest) · `src/transport` one driver per protocol behind `dispatcher.ts` · `src/scenes` scene engine · `src/sync` merge + orchestration.
* Protocols: `ir` (phone blaster, or a Broadlink hub if one is linked), `wifi` (Roku, Samsung Tizen, LG webOS), `ble` (simple RGB lights), `bluetooth_hid` (phone acts as a Bluetooth keyboard/media remote).
* Native Android modules (Kotlin, `android/app/src/main/java/com/unimote/app/`): `ir` (ConsumerIrManager), `lan` (SSDP, HTTP, WebSocket that tolerates TV self-signed certs on private IPs only), `hid` (BluetoothHidDevice), `hub` (Broadlink RM), `shortcuts` (icon shortcuts + Quick Settings tile).
* Deep links: `unimote://home`, `unimote://scene/<id>`, `unimote://remote/<id>`.
* iOS: parked until Xcode is available. All JS is shared; the native modules above are Android-only and degrade to "not available".

## 5. What is verified, and what is not

Verified by automated tests (no hardware): API + admin (47 specs), catalog round trip, JS drivers against fake sockets/HTTP, scene engine, sync merge, deep-link parsing, Kotlin packet/encoding helpers (IR, SSDP parsing, Broadlink packets, HID reports).

**Verified on an Android 36 emulator (arm64):** browse → brand search → model → match wizard (correctly reports no IR blaster) → save with a new room → remote screen rendered from the server layout → data persists across app restarts → scene create/edit/run (failure toast names the remote) → Wi-Fi remote connect flow, SSDP search, and Roku control end to end against a fake Roku on the host (Home, Play, Select, Power all arrived as the right `POST /keypress/<key>`).

**Not yet tested on real hardware** (compiles, unit-tested helpers only): IR blaster transmit, Roku on a real device, Samsung/LG control on a real TV, BLE lights, Bluetooth HID pairing, Broadlink send/learn, shortcuts and the Quick Settings tile. Expect to debug these on first contact with a device.

## 6. Known gaps

* Kaseikyo (Panasonic) / Pioneer / NEC42 signals are skipped by the importer (~1,900 signals); the `_Converted_` Flipper folder (~6,900 files) is not imported.
* Android TV / Fire TV / Apple TV control, Tuya hubs, and BLE lights other than the ELK-BLEDOM family are not implemented.
* LG webOS cannot be powered on over the network (needs Wake-on-LAN or IR).
* **Password reset is only half-built in the app:** the email links to `unimote://reset-password?token=…`, and the API accepts it (`PUT /auth/password`), but the app has no screen or link handler for it yet, so the link does nothing.
* Custom panels and recorded remotes live on the phone only; they are not synced.
* Recorded remotes assume a 38 kHz carrier (learning hubs do not report it).
* Conflicts in sync: the phone's copy wins; deletions made on another device are applied only when that device syncs first.

## When a device is not in the catalog

The data is real community-recorded IR (Flipper-IRDB), not placeholder data, but it is limited: most models have one code set. So the app does not depend on exact-model hits:

1. **Model missing, brand present:** "Try the <brand> codes" runs the match wizard over that brand's code sets. Sets with an identical test signal are collapsed (381 TV IR configs have only 115 distinct signals) and ranked by how many models share the code, then popularity, so the likeliest codes come first.
2. **Brand missing:** "Try common <category> codes" runs the wizard across all brands (`GET /remotes/match` without `brand`).
3. **Still nothing:** "Request this device" posts to `POST /model_requests`. Requests are merged per brand/model/category and counted once per person; admins see them ranked by demand under Moderation > Model requests, and can mark them added or declined.
4. **Record it yourself** with a Broadlink hub (Learn screen); the result can be submitted for review.

To grow coverage, import more sources (the skipped `_Converted_` Flipper folder, other open IR databases) and approve user submissions.

### Bigger coverage: extra sources (dev DB only; none are in the committed snapshot)

Each source is tagged (`source:` on the remote) so it can be reviewed or removed alone, and `catalog:export` leaves `flipper_converted`, `smartir` and `lirc` out unless you pass `INCLUDE_SOURCES=smartir,lirc,...`.

| Source | Task | Result | Remove with |
|---|---|---|---|
| Flipper-IRDB `_Converted_` | `catalog:import_flipper_converted[path]` | 6,681 remotes | `RemoteConfig.where(source: "flipper_converted").destroy_all` |
| SmartIR climate (MIT) | `catalog:import_smartir[path]` | 393 AC state tables, 142 brands (skipped: 13 Xiaomi-format, 13 over 1,500 states) | `source: "smartir"` |
| LIRC remotes DB | `catalog:import_lirc[path]` | 2,580 remotes; skipped RC5/RC6/SHIFT_ENC/RCMM (bi-phase timing unverified) | `source: "lirc"` |

Dev DB totals after all imports: 11,183 published remotes, 1,912 brands, 10,938 models (was 1,554 / 605 / 1,552).

**Overlap is high.** These IR databases share a lineage: of 2,322 comparable LIRC remotes, 1,564 repeat codes already present, 178 overlap in part, 580 are new (plus 339 brands that exist nowhere else). More databases of the same kind will keep giving diminishing returns; real gaps are better closed by user submissions, model requests (admin: Moderation > Model requests) and AC protocol encoders.

**Uncategorised remotes ("Other", about 4,000).** Many sources name only a model number. A button-presence classifier and a "shares a code with a categorised remote" rule were both measured on held-out data at 65-78% precision, so neither is used. Instead: keyword rules (device-type folder, LIRC header, model-number families, IR_Plus source path) plus conservative button rules; the rest stay in "Other" and the API lists them after the categorised ones for AV categories (`uncategorised: true`; see `Catalog::Categories::AV_FAMILY`).

**AC state tables.** An AC sends its whole setting on each press, so a SmartIR code set is stored as one signal per mode x fan [x swing] x temperature (`signal_data.ac` + `commands`, layout `ac_state`, signals as Broadlink base64). The app draws a state panel (power, temperature, mode, fan, swing) and sends the one signal for the new state. Verified on an emulator (renders from real Daikin data; send fails cleanly with no IR blaster) and by unit tests; NOT verified on a real AC. Tables are 8 KB to 1 MB each; the app's AsyncStorage cap was raised to 50 MB for them.

**Licensing: decide before shipping any of the above.** Flipper-IRDB says commits before its CC0 licence commit (Aug 2025) are not covered by CC0, and `_Converted_` predates it and derives largely from probonopd/irdb (its terms: notify the project, show an attribution notice, supply free units on request), LIRC and Pronto collections. The LIRC remotes repository has no licence statement I could find. SmartIR is MIT (keep its notice). The same CC0 caveat partly applies to the curated Flipper folders. Not legal advice.

**IR encoders added (Kaseikyo, NEC42, Pioneer).** `Catalog::IrEncoder` now covers the protocols the Flipper importer used to skip; re-running `catalog:import_flipper` added 58 remotes and about 1,865 signals, with none unsupported. Verification is against other people's captures already in the DB: 12,102 of 12,103 Kaseikyo-shaped signals and 2,567 of 2,567 NEC42-shaped signals re-encode to identical bits (timings within 300 us). Pioneer's bits are trivially right (NEC-shaped); its timings come from Flipper's firmware constants, and real captures with other time bases (about 568 us marks) exist, so treat Pioneer as likely-correct, not proven. None of it has been sent to a real device.

**Daikin AC encoder (IRremoteESP8266 layout, LGPL-2.1).** `Catalog::AcEncoders::Daikin` builds the common 35-byte frame (power, mode, fan, swing, temperature, three checksums). It reproduces every state field of SmartIR table 1118 and round-trips all 3,654 decoded frames; bytes 13-15 (the clock the original remote stamps in) are the only differences. It is NOT wired into the catalog: nothing maps a model to a protocol, SmartIR already has full tables for these Daikin models, and 5 other Daikin frame formats exist in SmartIR that this does not cover. Do not add more AC protocols until a concrete model list needs one.

**Licensing of the encoders.** The Kaseikyo/NEC42/Pioneer layouts and timings were read from Flipper's firmware (GPL-3.0) and the Daikin layout from IRremoteESP8266 (LGPL-2.1). They are protocol facts reimplemented from scratch in Ruby and validated against independent data, but include both in the licensing review (G5).

## Notification controls
Remote screen > options (...) > "Show in notifications" pins an ongoing, silent notification with up to four buttons (power, volume, mute, channel; first usable IR codes). Buttons broadcast to `IrActionReceiver`, which transmits through the phone's IR blaster directly, so the app need not be open. Only one remote is pinned at a time. Phone-IR remotes only: Wi-Fi, Bluetooth and hub-linked remotes do not qualify. Android 13+ asks for the notification permission the first time. Code: `android/.../notify/*`, `src/lib/notificationActions.ts`, `src/native/UnimoteNotify.ts`.

## Android TV / Google TV over Wi-Fi
Covers Sony, TCL, Hisense, Philips, Xiaomi, Nvidia Shield and Chromecast with Google TV (Android TV "Remote v2"). **Not Fire TV** (different, undocumented protocol): Fire TV works only through the Bluetooth route.

How it works: the TV announces itself over mDNS (`_androidtvremote2._tcp`), so it appears in the Wi-Fi scan. Add > the TV shows a 6-character code > type it in the dialog > the phone proves it with a SHA-256 over both certificates' RSA keys and the code > the TV remembers this phone's certificate (kept in app storage `atv_identity.p12`, so it survives restarts) > key presses go over TLS on port 6466 (pairing is 6467). Code: `android/.../atv/*` (protocol `AtvProto`, secret `AtvSecret`, identity `AtvIdentity`, sessions `AtvPairing`/`AtvRemote`, module `UnimoteAtvModule`), `src/transport/wifi/androidtv.ts`, `src/lib/atvKeys.ts`, `src/components/CodePrompt.tsx`; catalog profile `Catalog::Profiles::ANDROID_TV` (key names are `KEYCODE_*`; a spec checks the app knows every one).

**Testing without a TV.** `unimote_app/tools/fake_android_tv.py` is a pretend TV that speaks the real protocol (needs `pip install androidtvremote2 cryptography pyopenssl`):
```
python3 tools/fake_android_tv.py --code-file /tmp/atv_code --keys-file /tmp/atv_keys
```
It prints the pairing code and every key it receives. On the emulator its address is `10.0.2.2` (type it in "Or enter the IP address" on the Connect screen). The JVM test `AtvLiveTest` runs the Kotlin code against it when `ATV_FAKE_DIR` is set (skipped otherwise). The wire messages are checked byte for byte against the open-source `androidtvremote2` client in `AtvProtoTest`.

Not verified: a real TV (some brands may differ), and mDNS discovery on a real network (the emulator cannot see mDNS). If a TV does not appear in the scan, the "Or enter the IP address" box on the Connect screen still works.

**Port 3000 clash.** If another local project already uses port 3000, the app gets `404 Not found` from it. Run Unimote's API elsewhere (`bin/rails s -p 3010 -b 0.0.0.0`) and set Settings > Developer > API server to `http://10.0.2.2:3010` (emulator) or run `adb reverse tcp:3010 tcp:3010` and use `http://localhost:3010` (USB phone). Press Save, not just Done on the keyboard.

## Add a remote: scan first, then catalog
Every "Add a remote" button opens `NearbyScreen`. It runs two searches at once and shows each section as soon as it finishes:
1. **Wi-Fi** (`src/transport/nearby.ts` `scanNetwork`): the three SSDP searches the catalog's Wi-Fi profiles advertise (Roku, Samsung Tizen, LG webOS) plus Broadlink discovery; each answering device is asked for its name (Roku `:8060/query/device-info`, Samsung `:8001/api/v2/`, LG its SSDP description). Add looks up the Wi-Fi profile (`/remotes/match?protocol=wifi`), pairs, saves and opens the remote. IR hubs are listed for information (chosen per IR remote on its Connect screen).
2. **Bluetooth** (`scanBluetooth`): devices already paired in Android Settings; Add uses the "Bluetooth remote (phone as HID)" profile, which suits Android TV, Fire TV and PCs. Asks for the Bluetooth permission first.
3. **Not listed?** "Choose by device type (infrared)" opens the existing category > brand > model > test flow; "Record your remote" opens Learn.

Limits: SSDP multicast does not cross the Android emulator's virtual network, so test on a real phone on the same Wi-Fi as the device; routers with client isolation hide devices; BLE lights are not scanned (their profile is still a draft); Android TV / Fire TV are only reachable through Bluetooth HID, Apple TV not at all. Nothing here has been run against a real TV, hub or Bluetooth device yet.

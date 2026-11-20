require "base64"

module Catalog
  # Broadlink IR packets (the format SmartIR and Broadlink RM hubs use): 0x26, repeat, little-endian length,
  # then durations in ticks of 8192/269 microseconds (a 0x00 byte introduces a 16-bit big-endian tick count).
  # The carrier frequency is not part of the format; consumers assume 38 kHz.
  module Broadlink
    TICK_US = 8192.0 / 269
    CARRIER_HZ = 38_000
    TRAILING_GAP_US = 20_000

    module_function

    # Base64 packet -> [mark, space, mark, ...] in microseconds, or nil if it is not a valid IR packet.
    def decode(b64)
      bytes = Base64.decode64(b64.to_s).bytes
      return nil unless bytes.size > 4 && bytes[0] == 0x26

      length = bytes[2] | (bytes[3] << 8)
      data = bytes[4, length] or return nil
      durations = []
      i = 0
      while i < data.size
        if data[i].zero?
          return nil if i + 2 >= data.size
          ticks = (data[i + 1] << 8) | data[i + 2]
          i += 3
        else
          ticks = data[i]
          i += 1
        end
        durations << (ticks * TICK_US).round
      end
      durations.size >= 2 && durations.all?(&:positive?) ? durations : nil
    end

    # Microsecond durations -> base64 Broadlink packet (no 16-byte padding; the hub driver pads when sending).
    # There is no separate trailer: the final inter-frame gap (usually `00 0d 05` = 3333 ticks) ends the data.
    def encode(pattern)
      pattern = pattern + [TRAILING_GAP_US] if pattern.size.odd?
      data = pattern.flat_map do |us|
        ticks = [(us / TICK_US).round, 1].max
        ticks > 255 ? [0, ticks >> 8, ticks & 0xff] : [ticks]
      end
      Base64.strict_encode64(([0x26, 0x00, data.size & 0xff, data.size >> 8] + data).pack("C*"))
    end

    def signal(b64)
      pattern = decode(b64)
      pattern && { "frequency" => CARRIER_HZ, "duty_cycle" => 0.33, "pattern" => pattern }
    end
  end
end

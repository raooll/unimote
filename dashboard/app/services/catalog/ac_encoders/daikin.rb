module Catalog
  module AcEncoders
    # Daikin ARC4xx-style 35-byte AC frame (ported from the layout in IRremoteESP8266's ir_Daikin.cpp, LGPL-2.1;
    # see docs/RUNBOOK.md for the licence note). Three sections of 8 + 8 + 19 bytes, each ending in a byte sum.
    # Bits go out LSB first. Verified against 3,654 real frames from SmartIR Daikin tables (spec + RUNBOOK).
    class Daikin
      MODES = { auto: 0, dry: 2, cool: 3, heat: 4, fan_only: 6 }.freeze
      FAN_AUTO = 0b1010
      FAN_QUIET = 0b1011
      DRY_TEMP_BYTE = 0xC0 # in dry mode the remote sends a fixed byte instead of the setpoint

      # Library "known good" frame (checksums are filled in by #bytes).
      DEFAULT = [0x11, 0xDA, 0x27, 0, 0xC5, 0, 0, 0, 0x11, 0xDA, 0x27, 0, 0x42, 0, 0, 0, 0x11, 0xDA, 0x27, 0, 0, 0x49, 0x1E,
                 0, 0xB0, 0, 0, 0x06, 0x60, 0, 0, 0xC0, 0, 0, 0].freeze

      BIT_MARK = 428
      ONE_SPACE = 1280
      ZERO_SPACE = 428
      HDR_MARK = 3650
      HDR_SPACE = 1623
      GAP = 29_000

      def initialize(base = DEFAULT)
        raise ArgumentError, "need 35 bytes" unless base.size == 35

        @raw = base.dup
      end

      def self.from_bytes(bytes) = new(bytes)

      def power=(on)
        @raw[21] = (@raw[21] & ~1) | (on ? 1 : 0)
      end

      def mode=(name)
        @raw[21] = (@raw[21] & ~0x70) | (MODES.fetch(name.to_sym) << 4)
        @mode = name.to_sym
      end

      def temp=(celsius)
        degrees = celsius.to_f.clamp(10, 32)
        @raw[22] = (@mode == :dry ? DRY_TEMP_BYTE : (degrees * 2).to_i)
      end

      # 1..5, :auto or :quiet
      def fan=(speed)
        code = case speed
               when :auto then FAN_AUTO
               when :quiet then FAN_QUIET
               when 1..5 then speed + 2
               else raise ArgumentError, "fan #{speed.inspect}"
               end
        @raw[24] = (@raw[24] & 0x0F) | (code << 4)
      end

      def swing_vertical=(on)
        @raw[24] = (@raw[24] & 0xF0) | (on ? 0x0F : 0)
      end

      def bytes
        b = @raw.dup
        b[7] = b[0, 7].sum & 255
        b[15] = b[8, 7].sum & 255
        b[34] = b[16, 18].sum & 255
        b
      end

      def self.valid_checksums?(b)
        b.size == 35 && b[7] == b[0, 7].sum % 256 && b[15] == b[8, 7].sum % 256 && b[34] == b[16, 18].sum % 256
      end

      # On/off durations (microseconds), starting with a mark: 5-bit preamble, then the three sections.
      def pattern
        out = []
        5.times { |i| out << BIT_MARK << (i == 4 ? ZERO_SPACE + GAP : ZERO_SPACE) }
        b = bytes
        [b[0, 8], b[8, 8], b[16, 19]].each do |section|
          out << HDR_MARK << HDR_SPACE
          section.each { |byte| 8.times { |i| out << BIT_MARK << ((byte >> i) & 1 == 1 ? ONE_SPACE : ZERO_SPACE) } }
          out << BIT_MARK << (ZERO_SPACE + GAP)
        end
        out
      end

      def signal = { "frequency" => 38_000, "duty_cycle" => 0.33, "pattern" => pattern }
    end
  end
end

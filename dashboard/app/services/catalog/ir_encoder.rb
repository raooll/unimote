module Catalog
  # Converts "parsed" IR signals (protocol + address + command, as used by Flipper-IRDB)
  # into raw mark/space timings in microseconds, starting with a mark. That is exactly what
  # Android's ConsumerIrManager.transmit() and Wi-Fi IR hubs (Broadlink/Tuya) need, so the
  # mobile app never has to know about individual protocols.
  #
  # Returns { "frequency" => Hz, "duty_cycle" => Float, "pattern" => [..] } or nil when the
  # protocol is not supported.
  module IrEncoder
    SUPPORTED = %w[NEC NECext NEC42 Samsung32 RC5 RC5X RC6 SIRC SIRC15 SIRC20 RCA Kaseikyo Pioneer].freeze

    module_function

    def supported?(protocol) = SUPPORTED.include?(protocol)

    def encode(protocol, address, command)
      case protocol
      when "NEC"       then nec([address & 0xFF, (~address) & 0xFF, command & 0xFF, (~command) & 0xFF])
      when "NECext"    then nec([address & 0xFF, (address >> 8) & 0xFF, command & 0xFF, (command >> 8) & 0xFF])
      when "NEC42"     then nec42(address, command)
      when "Kaseikyo"  then kaseikyo(address, command)
      when "Pioneer"   then pioneer(address, command)
      when "Samsung32" then samsung32(address & 0xFF, command & 0xFF)
      when "RC5"       then rc5(address, command, extended: false)
      when "RC5X"      then rc5(address, command, extended: true)
      when "RC6"       then rc6(address, command)
      when "SIRC"      then sirc(address, command, 5)
      when "SIRC15"    then sirc(address, command, 8)
      when "SIRC20"    then sirc(address, command, 13)
      when "RCA"       then rca(address, command)
      end
    end

    # --- protocols -----------------------------------------------------------

    def nec(bytes)
      pattern = [9000, 4500]
      bytes.each { |byte| 8.times { |i| pattern.push(560, byte[i] == 1 ? 1690 : 560) } } # LSB first
      pattern << 560
      result(38_000, 0.33, pattern)
    end

    # NEC with 13-bit address (+ inverse) and 8-bit command (+ inverse): 42 bits, LSB first.
    # Layout and timings follow Flipper's firmware (infrared_encoder_nec.c), which is what the .ir files assume.
    def nec42(address, command)
      a = address & 0x1FFF
      c = command & 0xFF
      value = a | ((~a & 0x1FFF) << 13) | ((c & 0x3F) << 26) | ((c >> 6) << 32) | ((~c & 0xFF) << 34)
      pattern = [9000, 4500]
      42.times { |i| pattern.push(560, value[i] == 1 ? 1690 : 560) }
      pattern << 560
      result(38_000, 0.33, pattern)
    end

    # Kaseikyo / Panasonic family: 48 bits, unit 432us. `address` packs id(2 bits)<<24 | vendor(16)<<8 | genre1<<4 | genre2.
    def kaseikyo(address, command)
      vendor = (address >> 8) & 0xFFFF
      genre1 = (address >> 4) & 0xF
      genre2 = address & 0xF
      id = (address >> 24) & 3
      b = [vendor & 0xFF, vendor >> 8]
      parity = b[0] ^ b[1]
      parity = (parity & 0xF) ^ (parity >> 4)
      b << ((parity & 0xF) | (genre1 << 4))
      b << ((genre2 & 0xF) | ((command & 0xF) << 4))
      b << ((id << 6) | ((command >> 4) & 0x3F))
      b << (b[2] ^ b[3] ^ b[4])
      pattern = [3456, 1728]
      b.each { |byte| 8.times { |i| pattern.push(432, byte[i] == 1 ? 1296 : 432) } }
      pattern << 432
      result(38_000, 0.33, pattern)
    end

    # Pioneer: NEC-shaped at 40 kHz with 500us marks (8500/4225 preamble), address and command each followed by their inverse.
    def pioneer(address, command)
      bytes = [address & 0xFF, ~address & 0xFF, command & 0xFF, ~command & 0xFF]
      pattern = [8500, 4225]
      bytes.each { |byte| 8.times { |i| pattern.push(500, byte[i] == 1 ? 1500 : 500) } }
      pattern << 500
      result(40_000, 0.33, pattern)
    end

    def samsung32(address, command)
      pattern = [4500, 4500]
      [address, address, command, (~command) & 0xFF].each do |byte|
        8.times { |i| pattern.push(550, byte[i] == 1 ? 1650 : 550) }
      end
      pattern << 550
      result(38_000, 0.33, pattern)
    end

    def sirc(address, command, address_bits)
      pattern = [2400, 600]
      bits = Array.new(7) { |i| command[i] } + Array.new(address_bits) { |i| address[i] } # LSB first
      bits.each { |b| pattern.push(b == 1 ? 1200 : 600, 600) }
      pattern.pop # drop trailing space
      result(40_000, 0.33, pattern)
    end

    def rca(address, command)
      a = address & 0xF
      c = command & 0xFF
      value = (a << 20) | (c << 12) | (((~a) & 0xF) << 8) | ((~c) & 0xFF)
      pattern = [4000, 4000]
      24.times { |i| pattern.push(500, value[23 - i] == 1 ? 2000 : 1000) } # MSB first
      pattern << 500
      result(58_000, 0.33, pattern)
    end

    # RC5 / RC5X: Manchester, 889us half-bit, 36 kHz. '1' = space+mark, '0' = mark+space.
    def rc5(address, command, extended:)
      address &= 0x1F
      field = 1
      if extended && command >= 64
        field = 0
        command -= 64
      end
      bits = [1, field, 0] + 5.times.map { |i| address[4 - i] } + 6.times.map { |i| (command & 0x3F)[5 - i] }
      halves = bits.flat_map { |b| b == 1 ? [false, true] : [true, false] }
      halves.shift while halves.first == false # leading idle
      from_halves(halves, 889, 36_000)
    end

    # RC6 mode 0: leader 6T/2T, start bit, mode 000, double-width trailer bit, 8-bit address, 8-bit command.
    # Manchester with T=444us; '1' = mark+space, '0' = space+mark.
    def rc6(address, command)
      halves = [true] * 6 + [false] * 2          # leader
      halves += [true, false]                      # start bit (1)
      3.times { halves += [false, true] }          # mode 000
      halves += [false, false, true, true]         # trailer bit (0), double width
      (8.times.map { |i| (address & 0xFF)[7 - i] } + 8.times.map { |i| (command & 0xFF)[7 - i] }).each do |b|
        halves += b == 1 ? [true, false] : [false, true]
      end
      halves.pop while halves.last == false
      from_halves(halves, 444, 36_000)
    end

    # --- helpers -------------------------------------------------------------

    # Run-length encode a list of half-bit levels (true = mark) into durations.
    def from_halves(halves, unit, frequency)
      pattern = []
      halves.chunk_while { |a, b| a == b }.each { |run| pattern << run.size * unit }
      result(frequency, 0.33, pattern)
    end

    def result(frequency, duty, pattern)
      { "frequency" => frequency, "duty_cycle" => duty, "pattern" => pattern }
    end
  end
end

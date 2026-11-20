require "rails_helper"

RSpec.describe Catalog::IrEncoder do
  def bits(pattern, from, count, threshold) = pattern[from, count * 2].each_slice(2).map { |_m, s| s > threshold ? 1 : 0 }
  def bytes(bits) = bits.each_slice(8).map { |b| b.each_with_index.sum { |v, i| v << i } }

  describe "Kaseikyo" do
    # Flipper-IRDB Panasonic_DPVF1615ZA.ir: address 80 02 20 00, command D0 03 00 00
    subject(:sig) { described_class.encode("Kaseikyo", 0x00200280, 0x3D0) }

    it "builds the 48-bit Panasonic frame with both parity bytes" do
      expect(bytes(bits(sig["pattern"], 2, 48, 864))).to eq([0x02, 0x20, 0x80, 0x00, 0x3D, 0xBD])
      expect(sig["pattern"].first(2)).to eq([3456, 1728])
      expect(sig["pattern"].size).to eq(2 + 96 + 1)
    end

    it "carries the id bits and a non-zero vendor parity" do
      sony = described_class.encode("Kaseikyo", (2 << 24) | (0x5AAA << 8) | 0x12, 0x155)
      b = bytes(bits(sony["pattern"], 2, 48, 864))
      expect(b[2] & 0xF).to eq(0xF) # 0xAA ^ 0x5A = 0xF0, nibbles 0 ^ F
      expect(b[4] >> 6).to eq(2)
      expect(b[5]).to eq(b[2] ^ b[3] ^ b[4])
    end
  end

  describe "NEC42" do
    it "sends 13 bit address, inverse, 8 bit command, inverse (42 bits, LSB first)" do
      sig = described_class.encode("NEC42", 0x1ABC, 0xA5)
      v = bits(sig["pattern"], 2, 42, 1000).each_with_index.sum { |b, i| b << i }
      expect([v & 0x1FFF, (v >> 13) & 0x1FFF]).to eq([0x1ABC, ~0x1ABC & 0x1FFF])
      expect([((v >> 26) & 0x3F) | (((v >> 32) & 3) << 6), (v >> 34) & 0xFF]).to eq([0xA5, ~0xA5 & 0xFF])
      expect(sig["pattern"].first(2)).to eq([9000, 4500])
    end
  end

  describe "Pioneer" do
    it "is NEC-shaped at 40 kHz with an 8500/4225 preamble" do
      sig = described_class.encode("Pioneer", 0xA5, 0x1C)
      expect(sig).to include("frequency" => 40_000)
      expect(sig["pattern"].first(2)).to eq([8500, 4225])
      expect(bytes(bits(sig["pattern"], 2, 32, 1000))).to eq([0xA5, 0x5A, 0x1C, 0xE3])
    end
  end

  it "reports all three as supported" do
    expect(%w[Kaseikyo NEC42 Pioneer].all? { |p| described_class.supported?(p) }).to be(true)
  end
end

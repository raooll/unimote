require "rails_helper"

RSpec.describe Catalog::Broadlink do
  it "round-trips a pattern within one tick of rounding error" do
    pattern = [9000, 4500, 560, 560, 560, 1690, 560, 20_000]
    decoded = described_class.decode(described_class.encode(pattern))
    expect(decoded.size).to eq(pattern.size)
    pattern.each_with_index { |us, i| expect(decoded[i]).to be_within(described_class::TICK_US).of(us) }
  end

  it "uses 3-byte form for durations over 255 ticks and appends a gap to a pattern ending in a mark" do
    packet = Base64.decode64(described_class.encode([9000, 4500, 560])).bytes
    expect(packet[0]).to eq(0x26)
    expect(packet[4, 3]).to eq([0, 296 >> 8, 296 & 0xff]) # 9000 us = 296 ticks
    expect(described_class.decode(described_class.encode([9000, 4500, 560])).size).to be >= 4
  end

  it "rejects things that are not IR packets" do
    expect(described_class.decode("not base64 at all!!")).to be_nil
    expect(described_class.decode(Base64.strict_encode64("\x00\x01\x02\x03\x04".b))).to be_nil
    expect(described_class.decode(nil)).to be_nil
  end

  it "builds a 38 kHz signal" do
    expect(described_class.signal(described_class.encode([9000, 4500]))).to include("frequency" => 38_000)
  end
end

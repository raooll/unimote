require "rails_helper"

RSpec.describe Catalog::AcEncoders::Daikin do
  # Real frames from SmartIR Daikin tables (MIT), decoded from Broadlink. Bytes 13-15 are the clock the original
  # remote stamped into each frame (plus its section checksum): not part of the AC state.
  frames = JSON.parse(File.read(Rails.root.join("spec/fixtures/daikin_frames.json")))
  CLOCK = [13, 14, 15].freeze

  it "has valid checksums on every real frame" do
    expect(frames.values.flat_map(&:values)).to all(satisfy { |f| described_class.valid_checksums?(f) })
  end

  it "rebuilds table 1118's cool/heat states from power, mode, fan and temperature alone" do
    table = frames["1118"]
    base = table.find { |k, _| k.start_with?("COOL_") }.last
    checked = 0
    table.each do |key, f|
      m = key.match(/\A(COOL|HEAT)_(AUTO|\d)_(\d+)\z/) or next
      e = described_class.new(base)
      e.power = true
      e.mode = m[1].downcase
      e.fan = m[2] == "AUTO" ? :auto : m[2].to_i
      e.temp = m[3].to_i
      expect(e.bytes.each_with_index.reject { |_, i| CLOCK.include?(i) }.map(&:first))
        .to eq(f.each_with_index.reject { |_, i| CLOCK.include?(i) }.map(&:first)), key
      checked += 1
    end
    expect(checked).to be > 30
  end

  it "round-trips every sampled frame through the setters" do
    frames.each_value do |table|
      table.each_value do |f|
        e = described_class.new(f)
        mode = described_class::MODES.key((f[21] >> 4) & 7)
        e.mode = mode
        e.temp = f[22] / 2.0 unless mode == :dry
        expect(e.bytes).to eq(f)
      end
    end
  end

  it "emits a signal the IR schema accepts, " do
    sig = described_class.new.signal
    expect(Catalog::SignalSchema.ir_errors("POWER" => sig)).to be_empty
    expect(sig["pattern"].size).to eq(10 + 3 * 4 + 2 * 8 * 35) # preamble, 3 x (header + trailer), 280 bits
  end

  it "uses the fixed dry-mode temperature byte" do
    e = described_class.new
    e.mode = :dry
    e.temp = 24
    expect(e.bytes[22]).to eq(0xC0)
  end
end

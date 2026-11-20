require "rails_helper"
require "tmpdir"

RSpec.describe Catalog::Importers::SmartirClimate do
  let(:root) { Pathname(Dir.mktmpdir) }
  let(:sig) { Catalog::Broadlink.encode([9000, 4500, 560, 560, 560, 1690]) }
  after { FileUtils.remove_entry(root) }

  def write(name, body)
    FileUtils.mkdir_p(root.join("codes/climate"))
    root.join("codes/climate/#{name}.json").write(body.to_json)
  end

  def base(extra = {})
    { manufacturer: "Acme", supportedModels: %w[A1 A2], supportedController: "Broadlink", commandsEncoding: "Base64",
      minTemperature: 16, maxTemperature: 30, precision: 1 }.merge(extra)
  end

  it "flattens mode > fan > temp into full-state keys and records what exists" do
    write("1", base(commands: { off: sig, cool: { low: { "24" => sig, "25" => sig }, auto: { "24" => sig } }, fan_only: { low: sig } }))
    described_class.new(root).call
    cfg = RemoteConfig.find_by!(external_id: "smartir:climate/1")
    expect(cfg.signal_data["commands"].keys).to match_array(%w[OFF COOL_LOW_24 COOL_LOW_25 COOL_AUTO_24 FAN_ONLY_LOW])
    expect(cfg.signal_data["ac"]["modes"]["cool"]).to include("fans" => %w[low auto], "temps" => %w[24 25])
    expect(cfg).to have_attributes(layout_template: "ac_state", source: "smartir", status: "published")
    expect(cfg.remote_model).to have_attributes(name: "A1, A2", device_category: DeviceCategory.find_by!(slug: "ac"))
  end

  it "handles a swing level between fan and temperature" do
    write("2", base(commands: { off: sig, cool: { low: { off: { "24" => sig }, vertical: { "24" => sig } } } }))
    described_class.new(root).call
    cfg = RemoteConfig.find_by!(external_id: "smartir:climate/2")
    expect(cfg.signal_data["commands"].keys).to include("COOL_LOW_OFF_24", "COOL_LOW_VERTICAL_24")
    expect(cfg.signal_data["ac"]["modes"]["cool"]["swings"]).to eq(%w[off vertical])
  end

  it "converts ESPHome raw timings, skips Xiaomi and unusable files, and is idempotent" do
    write("3", base(supportedController: "ESPHome", commandsEncoding: "Raw", commands: { off: "[3500, -3500, 850, -865]", cool: { low: { "24" => "[3500, -3500, 850, -865]" } } }))
    write("4", base(supportedController: "Xiaomi", commands: { off: "m0wm", cool: { low: { "24" => "m0wm" } } }))
    write("5", base(commands: { off: "garbage" }))
    stats = described_class.new(root).call
    expect(stats).to have_attributes(created: 1, skipped: 2)
    expect(Catalog::Broadlink.decode(RemoteConfig.find_by!(external_id: "smartir:climate/3").signal_data["commands"]["COOL_LOW_24"]["broadlink"])).to be_present
    expect { described_class.new(root).call }.not_to change(RemoteConfig, :count)
  end

  it "keeps the state table out of the default snapshot" do
    write("6", base(commands: { off: sig, cool: { low: { "24" => sig } } }))
    described_class.new(root).call
    path = root.join("snap.gz")
    Catalog::Snapshot.export(path)
    lines = Zlib::GzipReader.open(path.to_s) { |gz| gz.each_line.map { |l| JSON.parse(l) } }
    expect(lines.count { |l| l["t"] == "config" }).to eq(0)
    Catalog::Snapshot.export(path, include_sources: %w[smartir])
    lines = Zlib::GzipReader.open(path.to_s) { |gz| gz.each_line.map { |l| JSON.parse(l) } }
    expect(lines.count { |l| l["t"] == "config" }).to eq(1)
  end
end

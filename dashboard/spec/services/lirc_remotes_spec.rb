require "rails_helper"
require "tmpdir"

RSpec.describe Catalog::Importers::LircRemotes do
  let(:root) { Pathname(Dir.mktmpdir) }
  after { FileUtils.remove_entry(root) }

  SAMSUNG = <<~CONF.freeze
    # brand:                       			Samsung
    # model no. of remote control: 			BN59-00603A
    # devices being controlled by this remote:	LCD TV
    begin remote
      name  Samsung_BN59-00603A
      bits           16
      flags SPACE_ENC|CONST_LENGTH
      header       4493  4410
      one           595  1624
      zero          595   509
      ptrail        589
      pre_data_bits   16
      pre_data       0xE0E0
      gap          107567
      begin codes
          KEY_POWER   0x40BF   # Was: Power
          KEY_VOLUMEUP 0xE01F
          KEY_1       0x20DF
      end codes
    end remote
  CONF

  def write(rel, text)
    path = root.join("remotes", rel)
    FileUtils.mkdir_p(path.dirname)
    path.binwrite(text)
  end

  def bits(pattern) = pattern[2, 64].each_slice(2).map { |_m, s| s > 1000 ? 1 : 0 }.join

  it "produces the same bits as the Samsung32 encoder for the same button" do
    _, remotes = described_class.parse(SAMSUNG)
    commands, = described_class.encode_remote(remotes.first)
    reference = Catalog::IrEncoder.encode("Samsung32", 0x07, 0x02)["pattern"]
    expect(bits(commands["POWER"]["pattern"])).to eq(bits(reference))
    expect(commands["POWER"]["pattern"].first(2)).to eq([4493, 4410])
    expect(commands["POWER"]["pattern"].last).to eq(107_567) # ends on the gap
    expect(commands.keys).to include("POWER", "VOL_UP", "1") # KEY_ prefix and VOLUMEUP normalised
  end

  it "reads brand, model and device type from the header and files the remote accordingly" do
    write("samsung/BN59.lircd.conf", SAMSUNG)
    described_class.new(root).call
    cfg = RemoteConfig.find_by!(source: "lirc")
    expect(cfg.remote_model).to have_attributes(name: "BN59-00603A", source: "lirc")
    expect(cfg.remote_model.brand.name).to eq("Samsung")
    expect(cfg.remote_model.device_category.slug).to eq("tv")
  end

  it "imports raw codes, tolerates Latin-1 files, and skips bi-phase (RC5) and one-button remotes" do
    write("acme/raw.lircd.conf", "# brand: Caf\xE9\nbegin remote\n name raw\n flags RAW_CODES\n frequency 36000\n begin raw_codes\n  name KEY_POWER\n   900 450 60 60 60 160 60\n  name KEY_MUTE\n   900 450 60 160 60 60 60\n end raw_codes\nend remote\n")
    write("acme/rc5.lircd.conf", "begin remote\n name rc5\n bits 13\n flags RC5|CONST_LENGTH\n one 889 889\n zero 889 889\n gap 100000\n begin codes\n  KEY_POWER 0x1\n  KEY_MUTE 0x2\n end codes\nend remote\n")
    write("acme/one.lircd.conf", SAMSUNG.sub(/ +KEY_VOLUMEUP.*\n/, "").sub(/ +KEY_1 .*\n/, ""))
    stats = described_class.new(root).call
    expect(stats).to have_attributes(created: 1)
    expect(stats.reasons.keys).to include(a_string_starting_with("unsupported encoding RC5"), a_string_starting_with("fewer than 2"))
    raw = RemoteConfig.find_by!(source: "lirc").signal_data["commands"]["POWER"]
    expect(raw).to include("frequency" => 36_000, "pattern" => [900, 450, 60, 60, 60, 160, 60, 20_000]) # odd count gets a trailing gap
    expect(RemoteConfig.find_by!(source: "lirc").remote_model.brand.name).to include("Caf")
  end

  it "is idempotent and stays out of the default snapshot" do
    write("samsung/BN59.lircd.conf", SAMSUNG)
    described_class.new(root).call
    expect { described_class.new(root).call }.not_to change(RemoteConfig, :count)
    path = root.join("snap.gz")
    Catalog::Snapshot.export(path)
    expect(Zlib::GzipReader.open(path.to_s) { |gz| gz.each_line.count { |l| JSON.parse(l)["t"] == "config" } }).to eq(0)
  end
end

require "rails_helper"
require "tmpdir"

RSpec.describe Catalog::Importers::FlipperConverted do
  let(:root) { Pathname(Dir.mktmpdir) }
  after { FileUtils.remove_entry(root) }

  def write(rel, names)
    path = root.join("_Converted_", rel)
    FileUtils.mkdir_p(path.dirname)
    blocks = names.each_with_index.map { |n, i| "name: #{n}\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: #{format('%02x', i + 1)} 00 00 00\n" }
    path.write("Filetype: IR signals file\nVersion: 1\n#\n" + blocks.join("#\n"))
  end

  it "infers category from the device-type folder, names models, and tags the source" do
    write("CSV/S/Sony/Projector/12,-1.ir", %w[POWER VOL_UP])
    write("CSV/S/Sony/Unknown_Receiver/3,4.ir", %w[POWER VOL_UP])
    described_class.new(root).call

    proj = RemoteModel.find_by!(name: "Projector (code 12,-1)")
    expect(proj).to have_attributes(source: "flipper_converted")
    expect(proj.device_category.slug).to eq("projector")
    expect(proj.brand.name).to eq("Sony")
    expect(RemoteModel.find_by!(name: "Receiver (code 3,4)").device_category.slug).to eq("av_receiver")
    expect(RemoteConfig.pluck(:source).uniq).to eq(["flipper_converted"])
  end

  it "guesses model-number-only files from their buttons, else files them under Other" do
    write("Pronto/T/Toshiba/46RV525U.ir", %w[POWER CH_UP CH_DOWN VOL_UP VOL_DOWN INPUT])
    write("Pronto/T/Toshiba/XYZ-1.ir", %w[POWER MUTE])
    described_class.new(root).call
    expect(RemoteModel.find_by!(name: "46RV525U").device_category.slug).to eq("tv")
    expect(RemoteModel.find_by!(name: "XYZ-1").device_category.slug).to eq("other")
  end

  it "is idempotent and ranks below curated remotes" do
    write("CSV/S/Sony/TV/1,1.ir", %w[POWER VOL_UP VOL_DOWN MUTE])
    described_class.new(root).call
    expect { described_class.new(root).call }.not_to change(RemoteConfig, :count)
    expect(RemoteConfig.last.popularity).to eq(2) # 4 canonical buttons, halved
  end
end

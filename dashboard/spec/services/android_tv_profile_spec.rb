require "rails_helper"

RSpec.describe "Android TV profile" do
  let(:profile) { Catalog::Profiles::ANDROID_TV }
  # The app turns key names into Android key codes with this table; a name missing there would be a dead button.
  let(:app_keys) { File.read(Rails.root.join("../unimote_app/src/lib/atvKeys.ts")).scan(/\b(KEYCODE_[A-Z0-9_]+):/).flatten }

  it "only uses key names the app knows" do
    expect(profile["commands"].values - app_keys).to be_empty
  end

  it "covers the usual remote buttons" do
    expect(profile["commands"].keys).to include("POWER", "HOME", "BACK", "OK", "UP", "DOWN", "LEFT", "RIGHT", "VOL_UP", "VOL_DOWN", "MUTE", "0", "9")
  end

  it "is seeded for TVs and streaming boxes and found by the Wi-Fi match" do
    Catalog::Categories.seed!
    Catalog::Profiles.seed!
    configs = RemoteConfig.where(protocol: "wifi").select { |c| c.signal_data["driver"] == "android_tv" }
    expect(configs.map { |c| c.remote_model.device_category.slug }).to contain_exactly("tv", "streaming")
    expect(configs).to all(have_attributes(status: "published"))
    expect(profile["discovery"]).to eq("mdns" => "_androidtvremote2._tcp")
  end
end

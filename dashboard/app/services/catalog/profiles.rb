module Catalog
  # Hand-written, non-IR remote definitions (Wi-Fi smart TVs, Bluetooth HID, BLE lights).
  # These are protocol profiles shared by a whole device family, so they are modelled as
  # one "model" per family (e.g. LG webOS TVs). Keys are the canonical command names from
  # Catalog::Layouts; values are driver-specific and interpreted by the app's drivers.
  #
  # Only profiles we are confident about are `published`; others stay `draft` until verified
  # on real hardware (flip them in the admin).
  module Profiles
    NUMBER_KEYS = (0..9).to_h { |n| [n.to_s, n.to_s] }.freeze

    ROKU = {
      "driver" => "roku_ecp", "port" => 8060,
      "request" => { "method" => "POST", "path" => "/keypress/{value}" },
      "discovery" => { "ssdp" => "roku:ecp", "mdns" => nil },
      "commands" => {
        "POWER" => "Power", "HOME" => "Home", "BACK" => "Back", "UP" => "Up", "DOWN" => "Down", "LEFT" => "Left",
        "RIGHT" => "Right", "OK" => "Select", "INFO" => "Info", "MENU" => "Info", "PLAY" => "Play", "PAUSE" => "Play",
        "REWIND" => "Rev", "FAST_FORWARD" => "Fwd", "MUTE" => "VolumeMute", "VOL_UP" => "VolumeUp",
        "VOL_DOWN" => "VolumeDown", "CH_UP" => "ChannelUp", "CH_DOWN" => "ChannelDown", "SOURCE" => "InputTuner",
        "HDMI_1" => "InputHDMI1", "HDMI_2" => "InputHDMI2", "HDMI_3" => "InputHDMI3", "AV" => "InputAV1"
      }
    }.freeze

    SAMSUNG = {
      "driver" => "samsung_tizen", "port" => 8002, "fallback_port" => 8001,
      "request" => { "transport" => "websocket", "path" => "/api/v2/channels/samsung.remote.control?name={app_name_b64}",
                     "message" => { "method" => "ms.remote.control", "params" => { "Cmd" => "Click", "DataOfCmd" => "{value}",
                                                                                   "Option" => "false", "TypeOfRemote" => "SendRemoteKey" } } },
      "pairing" => { "token_header" => "ms.channel.connect", "persist" => "token" },
      "discovery" => { "ssdp" => "urn:samsung.com:device:RemoteControlReceiver:1" },
      "commands" => {
        "POWER" => "KEY_POWER", "MUTE" => "KEY_MUTE", "VOL_UP" => "KEY_VOLUP", "VOL_DOWN" => "KEY_VOLDOWN",
        "CH_UP" => "KEY_CHUP", "CH_DOWN" => "KEY_CHDOWN", "UP" => "KEY_UP", "DOWN" => "KEY_DOWN", "LEFT" => "KEY_LEFT",
        "RIGHT" => "KEY_RIGHT", "OK" => "KEY_ENTER", "BACK" => "KEY_RETURN", "HOME" => "KEY_HOME", "MENU" => "KEY_MENU",
        "INFO" => "KEY_INFO", "EXIT" => "KEY_EXIT", "SOURCE" => "KEY_SOURCE", "HDMI_1" => "KEY_HDMI1", "HDMI_2" => "KEY_HDMI2",
        "GUIDE" => "KEY_GUIDE", "PLAY" => "KEY_PLAY", "PAUSE" => "KEY_PAUSE", "STOP" => "KEY_STOP", "REWIND" => "KEY_REWIND",
        "FAST_FORWARD" => "KEY_FF", "LAST" => "KEY_PRECH"
      }.merge(NUMBER_KEYS.transform_values { |n| "KEY_#{n}" })
    }.freeze

    LG_WEBOS = {
      "driver" => "lg_webos", "port" => 3001, "fallback_port" => 3000,
      "request" => { "transport" => "websocket", "secure_port" => 3001 },
      "pairing" => { "register" => "ssap", "persist" => "client-key" },
      "discovery" => { "ssdp" => "urn:lge-com:service:webos-second-screen:1" },
      # {"uri"} = SSAP request, {"button"} = pointer-socket button event.
      "commands" => {
        "POWER" => { "uri" => "ssap://system/turnOff" },
        "POWER_OFF" => { "uri" => "ssap://system/turnOff" },
        "VOL_UP" => { "uri" => "ssap://audio/volumeUp" }, "VOL_DOWN" => { "uri" => "ssap://audio/volumeDown" },
        "MUTE" => { "uri" => "ssap://audio/setMute", "toggle" => true },
        "CH_UP" => { "uri" => "ssap://tv/channelUp" }, "CH_DOWN" => { "uri" => "ssap://tv/channelDown" },
        "PLAY" => { "uri" => "ssap://media.controls/play" }, "PAUSE" => { "uri" => "ssap://media.controls/pause" },
        "STOP" => { "uri" => "ssap://media.controls/stop" }, "REWIND" => { "uri" => "ssap://media.controls/rewind" },
        "FAST_FORWARD" => { "uri" => "ssap://media.controls/fastForward" },
        "UP" => { "button" => "UP" }, "DOWN" => { "button" => "DOWN" }, "LEFT" => { "button" => "LEFT" },
        "RIGHT" => { "button" => "RIGHT" }, "OK" => { "button" => "ENTER" }, "BACK" => { "button" => "BACK" },
        "HOME" => { "button" => "HOME" }, "EXIT" => { "button" => "EXIT" }, "MENU" => { "button" => "MENU" },
        "INFO" => { "button" => "INFO" }
      }
    }.freeze

    # Android TV / Google TV "Remote v2": TLS with a client certificate, one-time pairing with a 6-digit code shown on the TV.
    # Values are Android KeyEvent names; the app maps them to codes. Covers Sony, TCL, Hisense, Philips, Xiaomi, Nvidia Shield
    # and Chromecast with Google TV. NOT Fire TV (Amazon uses a different, undocumented protocol).
    ANDROID_TV = {
      "driver" => "android_tv", "port" => 6466, "pair_port" => 6467,
      "pairing" => { "method" => "code", "code_digits" => 6, "persist" => "certificate" },
      "discovery" => { "mdns" => "_androidtvremote2._tcp" },
      "commands" => {
        "POWER" => "KEYCODE_POWER", "HOME" => "KEYCODE_HOME", "BACK" => "KEYCODE_BACK", "MENU" => "KEYCODE_MENU",
        "UP" => "KEYCODE_DPAD_UP", "DOWN" => "KEYCODE_DPAD_DOWN", "LEFT" => "KEYCODE_DPAD_LEFT", "RIGHT" => "KEYCODE_DPAD_RIGHT",
        "OK" => "KEYCODE_DPAD_CENTER", "INFO" => "KEYCODE_INFO", "GUIDE" => "KEYCODE_GUIDE", "SETTINGS" => "KEYCODE_SETTINGS",
        "MUTE" => "KEYCODE_VOLUME_MUTE", "VOL_UP" => "KEYCODE_VOLUME_UP", "VOL_DOWN" => "KEYCODE_VOLUME_DOWN",
        "CH_UP" => "KEYCODE_CHANNEL_UP", "CH_DOWN" => "KEYCODE_CHANNEL_DOWN", "SOURCE" => "KEYCODE_TV_INPUT",
        "PLAY" => "KEYCODE_MEDIA_PLAY", "PAUSE" => "KEYCODE_MEDIA_PAUSE", "STOP" => "KEYCODE_MEDIA_STOP",
        "NEXT" => "KEYCODE_MEDIA_NEXT", "PREVIOUS" => "KEYCODE_MEDIA_PREVIOUS", "REWIND" => "KEYCODE_MEDIA_REWIND",
        "FAST_FORWARD" => "KEYCODE_MEDIA_FAST_FORWARD"
      }.merge(NUMBER_KEYS.transform_values { |n| "KEYCODE_#{n}" })
    }.freeze

    # USB HID usage ids. page 12 = Consumer (0x0C), page 7 = Keyboard.
    BLUETOOTH_HID = {
      "driver" => "android_bluetooth_hid", "platforms" => %w[android],
      "commands" => {
        "POWER" => { "page" => 12, "usage" => 0x30 }, "MUTE" => { "page" => 12, "usage" => 0xE2 },
        "VOL_UP" => { "page" => 12, "usage" => 0xE9 }, "VOL_DOWN" => { "page" => 12, "usage" => 0xEA },
        "CH_UP" => { "page" => 12, "usage" => 0x9C }, "CH_DOWN" => { "page" => 12, "usage" => 0x9D },
        "PLAY" => { "page" => 12, "usage" => 0xCD }, "PAUSE" => { "page" => 12, "usage" => 0xCD },
        "STOP" => { "page" => 12, "usage" => 0xB7 }, "NEXT" => { "page" => 12, "usage" => 0xB5 },
        "PREVIOUS" => { "page" => 12, "usage" => 0xB6 }, "FAST_FORWARD" => { "page" => 12, "usage" => 0xB3 },
        "REWIND" => { "page" => 12, "usage" => 0xB4 }, "MENU" => { "page" => 12, "usage" => 0x40 },
        "HOME" => { "page" => 12, "usage" => 0x223 }, "BACK" => { "page" => 12, "usage" => 0x224 },
        "UP" => { "page" => 7, "usage" => 0x52 }, "DOWN" => { "page" => 7, "usage" => 0x51 },
        "LEFT" => { "page" => 7, "usage" => 0x50 }, "RIGHT" => { "page" => 7, "usage" => 0x4F },
        "OK" => { "page" => 7, "usage" => 0x28 }, "EXIT" => { "page" => 7, "usage" => 0x29 }
      }
    }.freeze

    # Generic "ELK-BLEDOM"-style RGB strip. UNVERIFIED on hardware -> draft.
    BLE_RGB = {
      "service_uuid" => "0000fff0-0000-1000-8000-00805f9b34fb",
      "characteristic_uuid" => "0000fff3-0000-1000-8000-00805f9b34fb",
      "name_prefixes" => %w[ELK-BLEDOM ELK-BLE LEDBLE],
      "commands" => {
        "POWER_ON" => "7e0004f00001ff00ef", "POWER_OFF" => "7e0004000000ff00ef",
        # Fixed colours = the COLOR template below with preset rr gg bb
        "RED" => "7e070503ff000010ef", "GREEN" => "7e07050300ff0010ef", "BLUE" => "7e0705030000ff10ef", "WHITE" => "7e070503ffffff10ef"
      },
      "templates" => { "COLOR" => "7e070503{rr}{gg}{bb}10ef", "BRIGHTNESS" => "7e0401{vv}01ffff00ef" }
    }.freeze

    LIST = [
      { brand: "Roku", category: "streaming", model: "Roku players (ECP over Wi-Fi)", protocol: "wifi", layout: "streaming_simple", data: ROKU, status: "published" },
      { brand: "Roku", category: "tv", model: "Roku TVs (ECP over Wi-Fi)", protocol: "wifi", layout: "tv_standard", data: ROKU, status: "published" },
      { brand: "Samsung", category: "tv", model: "Smart TV 2016+ (Tizen, Wi-Fi)", protocol: "wifi", layout: "tv_standard", data: SAMSUNG, status: "published" },
      { brand: "LG", category: "tv", model: "Smart TV (webOS, Wi-Fi)", protocol: "wifi", layout: "tv_standard", data: LG_WEBOS, status: "published" },
      { brand: "Android TV", category: "tv", model: "Android TV / Google TV (Wi-Fi)", protocol: "wifi", layout: "tv_standard", data: ANDROID_TV, status: "published" },
      { brand: "Android TV", category: "streaming", model: "Android TV / Google TV (Wi-Fi)", protocol: "wifi", layout: "streaming_simple", data: ANDROID_TV, status: "published" },
      { brand: "Generic", category: "tv", model: "Bluetooth remote (Android phone as HID)", protocol: "bluetooth_hid", layout: "tv_standard", data: BLUETOOTH_HID, status: "published" },
      { brand: "Generic", category: "streaming", model: "Bluetooth remote (Android phone as HID)", protocol: "bluetooth_hid", layout: "streaming_simple", data: BLUETOOTH_HID, status: "published" },
      { brand: "Generic", category: "led_lighting", model: "BLE RGB strip (ELK-BLEDOM type)", protocol: "ble", layout: "light", data: BLE_RGB, status: "draft" }
    ].freeze

    def self.seed!
      Categories.seed! if DeviceCategory.none?
      LIST.each do |p|
        brand = Brand.find_or_create_by!(slug: p[:brand].parameterize) { |b| b.name = p[:brand] }
        category = DeviceCategory.find_by!(slug: p[:category])
        model = RemoteModel.find_or_create_by!(brand: brand, device_category: category, slug: p[:model].parameterize) do |m|
          m.name = p[:model]
          m.source = "manual"
        end
        key = "profile:#{p[:protocol]}:#{brand.slug}:#{category.slug}:#{model.slug}"
        config = RemoteConfig.find_or_initialize_by(external_id: key)
        creating = config.new_record?
        config.assign_attributes(remote_model: model, protocol: p[:protocol], variant: "default", source: "manual",
                                 layout_template: p[:layout], signal_data: p[:data].deep_stringify_keys)
        if config.changed?
          config.status = p[:status] if creating
          config.popularity = 100 if creating # curated profiles rank above scraped codes
          config.version += 1 unless creating
          config.save!
        end
      end
    end
  end
end

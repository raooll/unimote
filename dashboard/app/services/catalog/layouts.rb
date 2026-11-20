module Catalog
  # UI layout templates. The mobile app renders a remote from one of these plus the
  # config's available commands: buttons whose command the config doesn't have are
  # hidden, and commands not in the layout land in an "other buttons" section.
  #
  # Section types: row (equal-width buttons), dpad, rocker (up/down pair), keypad, grid
  module Layouts
    def self.btn(key, label = nil, icon = nil) = { key: key, label: label || key.tr("_", " ").capitalize, icon: icon }.compact

    POWER_ROW = { id: "power", type: "row", buttons: [btn("POWER", "Power", "power"), btn("MUTE", "Mute", "volume-x")] }.freeze
    DPAD = {
      id: "nav", type: "dpad",
      buttons: [btn("UP", nil, "chevron-up"), btn("DOWN", nil, "chevron-down"), btn("LEFT", nil, "chevron-left"),
                btn("RIGHT", nil, "chevron-right"), btn("OK", "OK")]
    }.freeze
    NAV_ROW = { id: "nav_actions", type: "row",
                buttons: [btn("BACK", nil, "arrow-left"), btn("HOME", nil, "home"), btn("MENU", nil, "menu"),
                          btn("EXIT"), btn("INFO", nil, "info")] }.freeze
    VOL_CH = {
      id: "rockers", type: "rocker",
      rockers: [
        { label: "Vol", up: btn("VOL_UP", "Vol +", "plus"), down: btn("VOL_DOWN", "Vol -", "minus") },
        { label: "Ch", up: btn("CH_UP", "Ch +", "chevron-up"), down: btn("CH_DOWN", "Ch -", "chevron-down") }
      ]
    }.freeze
    VOL_ONLY = { id: "rockers", type: "rocker",
                 rockers: [{ label: "Vol", up: btn("VOL_UP", "Vol +", "plus"), down: btn("VOL_DOWN", "Vol -", "minus") }] }.freeze
    KEYPAD = { id: "keypad", type: "keypad", buttons: (1..9).map { |n| btn(n.to_s) } + [btn("LAST", "Last"), btn("0"), btn("GUIDE", "Guide")] }.freeze
    MEDIA = { id: "media", type: "row",
              buttons: [btn("REWIND", nil, "rewind"), btn("PLAY", nil, "play"), btn("PAUSE", nil, "pause"),
                        btn("STOP", nil, "square"), btn("FAST_FORWARD", "FF", "fast-forward")] }.freeze
    SOURCES = { id: "sources", type: "grid",
                buttons: [btn("SOURCE", "Source"), btn("HDMI_1", "HDMI 1"), btn("HDMI_2", "HDMI 2"), btn("HDMI_3", "HDMI 3"),
                          btn("AV", "AV"), btn("USB", "USB")] }.freeze

    ALL = {
      "tv_standard" => { name: "TV", categories: %w[tv monitor], sections: [POWER_ROW, SOURCES, DPAD, NAV_ROW, VOL_CH, KEYPAD, MEDIA] },
      "stb_standard" => { name: "Set-top box", categories: %w[cable_box tv_tuner streaming], sections: [POWER_ROW, DPAD, NAV_ROW, VOL_CH, KEYPAD, MEDIA] },
      "streaming_simple" => { name: "Streaming device", categories: %w[streaming], sections: [POWER_ROW, DPAD, NAV_ROW, MEDIA, VOL_ONLY] },
      "ac_panel" => {
        name: "Air conditioner", categories: %w[ac],
        sections: [
          { id: "power", type: "row", buttons: [btn("POWER", "Power", "power"), btn("POWER_ON", "On", "power"), btn("POWER_OFF", "Off", "power-off")] },
          { id: "temp", type: "rocker", rockers: [{ label: "Temp", up: btn("TEMP_UP", "Temp +", "plus"), down: btn("TEMP_DOWN", "Temp -", "minus") }] },
          { id: "modes", type: "grid", buttons: [btn("MODE", "Mode"), btn("FAN", "Fan"), btn("SWING", "Swing"), btn("TIMER", "Timer"),
                                                 btn("SLEEP", "Sleep"), btn("TURBO", "Turbo")] }
        ]
      },
      # State-based AC: one full-state signal per mode x fan x temperature (see Catalog::Importers::SmartirClimate).
      # Drawn by the app's AC panel, so there are no buttons here. Not picked by category: it needs state-table data.
      "ac_state" => { name: "Air conditioner (state table)", categories: [], sections: [{ id: "ac", type: "ac_state" }] },
      "audio_receiver" => { name: "Receiver / Soundbar", categories: %w[av_receiver soundbar speaker cd_player], sections: [POWER_ROW, VOL_ONLY, SOURCES, DPAD, NAV_ROW, MEDIA] },
      "projector" => { name: "Projector", categories: %w[projector], sections: [POWER_ROW, SOURCES, DPAD, NAV_ROW, VOL_ONLY] },
      "fan" => {
        name: "Fan", categories: %w[fan air_purifier humidifier heater],
        sections: [{ id: "power", type: "row", buttons: [btn("POWER", "Power", "power")] },
                   { id: "speed", type: "grid", buttons: [btn("SPEED", "Speed"), btn("SPEED_UP", "Speed +"), btn("SPEED_DOWN", "Speed -"),
                                                          btn("OSCILLATE", "Swing"), btn("TIMER", "Timer"), btn("MODE", "Mode")] }]
      },
      "light" => {
        name: "Light", categories: %w[led_lighting],
        sections: [{ id: "power", type: "row", buttons: [btn("POWER", "Power", "power"), btn("POWER_ON", "On", "power"), btn("POWER_OFF", "Off", "power-off")] },
                   { id: "level", type: "rocker", rockers: [{ label: "Brightness", up: btn("BRIGHTNESS_UP", "Bright +", "sun"), down: btn("BRIGHTNESS_DOWN", "Bright -", "moon") }] },
                   { id: "colors", type: "grid", buttons: [btn("RED"), btn("GREEN"), btn("BLUE"), btn("WHITE"), btn("FLASH"), btn("SMOOTH")] }]
      },
      "media_player" => { name: "Media player", categories: %w[dvd_player blu_ray vcr console], sections: [POWER_ROW, DPAD, NAV_ROW, MEDIA, KEYPAD] },
      "generic" => { name: "Generic remote", categories: %w[other], sections: [POWER_ROW, DPAD, VOL_CH] }
    }.freeze

    KEYS = ALL.keys.freeze

    # Layout used when a category has no explicit mapping.
    def self.for_category(slug)
      ALL.find { |_, v| v[:categories].include?(slug) }&.first || "generic"
    end

    def self.as_json_catalog
      ALL.map { |key, v| { key: key, name: v[:name], categories: v[:categories], sections: v[:sections] } }
    end
  end
end

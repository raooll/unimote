module Catalog
  module Importers
    # Best-effort device category for imported remotes that do not say what they control. Deliberately conservative:
    # returns nil when unsure, and callers file those under "other" (a statistical guess measured under 80% accurate).
    module CategoryGuess
      # Checked in order; the first match wins. Matched against the device-type folder (CSV) or the file name.
      KEYWORDS = [
        [/projector/i, "projector"], [/monitor/i, "monitor"], [/sound ?(bar|base)/i, "soundbar"],
        [/dvb/i, "tv_tuner"], [/blu[ -]?ray|\bbd\b/i, "blu_ray"], [/dvd/i, "dvd_player"], [/\bcd\b|compact disc|\bdisc\b/i, "cd_player"],
        [/vcr|video ?recorder|\btape\b/i, "vcr"], [/satellite|\bsat\b|\bdss\b|\bdvr\b|cable|set[ -]?top|\bstb\b|\bbox\b|\bpvr\b/i, "cable_box"],
        [/stream|roku|chromecast|apple ?tv/i, "streaming"], [/console|playstation|xbox/i, "console"],
        [/air ?con|\bac\b|heat ?pump/i, "ac"], [/\bfan\b/i, "fan"], [/heater/i, "heater"], [/humidifier/i, "humidifier"],
        [/purifier/i, "air_purifier"], [/\blight|lamp|\bled\b/i, "led_lighting"],
        [/speaker|boombox|dock|jukebox|radio/i, "speaker"],
        [/receiver|amplifier|\bamp\b|processor|pre-?amp|surround|\bav\b|tuner|zone/i, "av_receiver"],
        [/directv|dish ?network|tivo|\bhd ?box\b/i, "cable_box"],
        [/\btv\b|\w+tv\b|television|plasma|\blcd\b|\bcrt\b|hdtv|bravia/i, "tv"],
        # Well-known model-number families (high precision). Receivers first: "STR-" / "RX-V" are never TVs.
        [/\b(rx-?[av]\d|htr-?\d|vsx-?\d|sc-(lx|\d)|avr-?\d|avc-?\d|tx-(sr|nr|ds|rz)|str-(d|k)|dht-|mcr-|avp-|cr-?\d{3}|\bsr\d{3,4}\b|nr\d{4}\b)/i, "av_receiver"],
        [/\b(kdl|xbr|kd-?\d{2}|ln\d{2}[a-z]|un\d{2}[a-z]|pn\d{2}|th-?\d{2}|tc-?[pl]\d{2}|tx-[lp]\d{2}|\d{2}[a-z]{1,3}\d{3,4}[a-z]?)\b/i, "tv"]
      ].freeze

      module_function

      def from_text(text)
        KEYWORDS.each { |re, slug| return slug if text.to_s.match?(re) }
        nil
      end

      # Model-number-only remotes: guess from which buttons exist.
      def from_buttons(keys)
        keys = keys.to_set
        ch = keys.include?("CH_UP") || keys.include?("CH_DOWN")
        vol = keys.include?("VOL_UP") || keys.include?("VOL_DOWN")
        audio_source = (keys & %w[AUX PHONO CD FM AM TUNER TAPE]).any?
        return "projector" if (keys.include?("LENS") || keys.include?("FREEZE")) && !ch
        return "av_receiver" if audio_source && !ch
        return "tv" if ch && vol && (keys & %w[INPUT SOURCE TV_AV AV HDMI_1 HDMI]).any?
        return "cable_box" if ch && !vol && keys.include?("GUIDE")

        nil
      end
    end
  end
end

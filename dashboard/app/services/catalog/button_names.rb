module Catalog
  # Maps the free-form button names found in third-party remote dumps
  # ("Vol_up", "VOL+", "Ch_next", "Num_1") to the canonical keys used by Catalog::Layouts.
  # Unknown names are kept (normalized) and shown in the app's "other buttons" section.
  module ButtonNames
    ALIASES = {
      "POWER" => %w[POWER PWR POWER_TOGGLE ONOFF ON_OFF POWER_ON_OFF STANDBY STAND_BY POWER_BUTTON TOGGLE POWER_SWITCH],
      "POWER_ON" => %w[POWER_ON ON PWR_ON TURN_ON],
      "POWER_OFF" => %w[POWER_OFF OFF PWR_OFF TURN_OFF],
      "MUTE" => %w[MUTE MUTING MUTE_TOGGLE SOUND_MUTE],
      "VOL_UP" => %w[VOL_UP VOLUME_UP VOL_PLUS VOLUME_PLUS VOLUP VOL_INC VOLUME_INC VOL_UP_1 SPEAKER_UP],
      "VOL_DOWN" => %w[VOL_DOWN VOLUME_DOWN VOL_MINUS VOLUME_MINUS VOLDOWN VOL_DEC VOLUME_DEC VOL_DN VOLUME_DN VOL_DOWN_1 SPEAKER_DOWN],
      "CH_UP" => %w[CH_UP CHANNEL_UP CH_PLUS CHANNEL_PLUS CHUP CH_NEXT CHANNEL_NEXT NEXT_CH PROG_UP PROGRAM_UP PAGE_UP CH_INC],
      "CH_DOWN" => %w[CH_DOWN CHANNEL_DOWN CH_MINUS CHANNEL_MINUS CHDOWN CH_PREV CHANNEL_PREV PREV_CH PROG_DOWN PROGRAM_DOWN PAGE_DOWN CH_DEC CH_DN],
      "UP" => %w[UP NAV_UP ARROW_UP CURSOR_UP DPAD_UP],
      "DOWN" => %w[DOWN NAV_DOWN ARROW_DOWN CURSOR_DOWN DPAD_DOWN],
      "LEFT" => %w[LEFT NAV_LEFT ARROW_LEFT CURSOR_LEFT DPAD_LEFT],
      "RIGHT" => %w[RIGHT NAV_RIGHT ARROW_RIGHT CURSOR_RIGHT DPAD_RIGHT],
      "OK" => %w[OK ENTER SELECT CENTER CONFIRM SET],
      "BACK" => %w[BACK RETURN PREVIOUS GO_BACK],
      "HOME" => %w[HOME SMART_HUB SMART HUB START],
      "MENU" => %w[MENU SETTINGS SETUP OPTIONS TOOLS],
      "EXIT" => %w[EXIT CLOSE CANCEL QUIT],
      "INFO" => %w[INFO INFORMATION DISPLAY STATUS],
      "GUIDE" => %w[GUIDE EPG TV_GUIDE],
      "LAST" => %w[LAST RECALL PREV_CHANNEL FLASHBACK],
      "SOURCE" => %w[SOURCE INPUT INPUTS TV_AV AV_TV SIGNAL SOURCES EXT],
      "AV" => %w[AV AV1 AV_1],
      "HDMI_1" => %w[HDMI_1 HDMI1],
      "HDMI_2" => %w[HDMI_2 HDMI2],
      "HDMI_3" => %w[HDMI_3 HDMI3],
      "USB" => %w[USB],
      "PLAY" => %w[PLAY PLAY_PAUSE],
      "PAUSE" => %w[PAUSE],
      "STOP" => %w[STOP],
      "REWIND" => %w[REWIND REW RWD BACKWARD REVERSE SCAN_BACK FAST_BA FAST_BACK FAST_REWIND],
      "FAST_FORWARD" => %w[FAST_FORWARD FF FWD FORWARD SCAN_FWD FAST_FO FAST_FWD],
      "NEXT" => %w[NEXT SKIP_NEXT NEXT_TRACK],
      "PREVIOUS" => %w[PREV SKIP_PREV PREV_TRACK PREVIOUS_TRACK],
      "RECORD" => %w[RECORD REC],
      "TEMP_UP" => %w[TEMP_UP TEMP_PLUS TEMPERATURE_UP TEMP_INC TEMP_HIGHER],
      "TEMP_DOWN" => %w[TEMP_DOWN TEMP_MINUS TEMPERATURE_DOWN TEMP_DEC TEMP_LOWER TEMP_DN],
      "MODE" => %w[MODE],
      "FAN" => %w[FAN FAN_SPEED FAN_MODE],
      "SWING" => %w[SWING SWING_UP_DOWN VANE],
      "TIMER" => %w[TIMER TIMER_ON_OFF],
      "SLEEP" => %w[SLEEP],
      "TURBO" => %w[TURBO BOOST POWERFUL],
      "SPEED" => %w[SPEED],
      "SPEED_UP" => %w[SPEED_UP SPEED_PLUS],
      "SPEED_DOWN" => %w[SPEED_DOWN SPEED_MINUS],
      "OSCILLATE" => %w[OSCILLATE OSCILLATION OSC ROTATE],
      "BRIGHTNESS_UP" => %w[BRIGHTNESS_UP BRIGHT_UP BRIGHTER DIM_UP LIGHT_UP BRIGHT_PLUS],
      "BRIGHTNESS_DOWN" => %w[BRIGHTNESS_DOWN BRIGHT_DOWN DIMMER DIM_DOWN LIGHT_DOWN DIM BRIGHT_MINUS],
      "RED" => %w[RED], "GREEN" => %w[GREEN], "BLUE" => %w[BLUE], "WHITE" => %w[WHITE],
      "FLASH" => %w[FLASH STROBE], "SMOOTH" => %w[SMOOTH FADE]
    }.freeze

    LOOKUP = ALIASES.each_with_object({}) { |(canon, names), h| names.each { |n| h[n] = canon } }.freeze
    DIGITS = %w[ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE].freeze

    module_function

    # "Vol+" -> "VOL_UP", "Num_5" -> "5", "Strange Button" -> "STRANGE_BUTTON"
    def normalize(raw)
      s = raw.to_s.strip
      s = s.gsub("+", "_PLUS_").sub(/-\z/, "_MINUS_").gsub("-", "_")
      s = s.gsub(/([a-z])([A-Z])/, '\1_\2').upcase.gsub(/[^A-Z0-9]+/, "_").gsub(/\A_+|_+\z/, "")
      return "" if s.empty?

      s = s.sub(/\A(NUM|NUMBER|DIGIT|KEY|BTN|BUTTON)_?(?=\d\z)/, "")
      return s if s.match?(/\A\d\z/)

      if (i = DIGITS.index(s)) then return i.to_s end

      # VOL_PLUS / VOLUME_PLUS style handled via LOOKUP; "+"/"-" suffix variants:
      LOOKUP[s] || LOOKUP[s.sub(/_PLUS\z/, "_UP")] || LOOKUP[s.sub(/_MINUS\z/, "_DOWN")] || s
    end

    def canonical?(key) = key.match?(/\A\d\z/) || ALIASES.key?(key)
  end
end

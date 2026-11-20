module Catalog
  # Structural validation of RemoteConfig#signal_data per protocol.
  module SignalSchema
    MAX_PATTERN = 2_000
    MAX_COMMANDS = 300
    MAX_AC_STATES = 1_500 # an AC state table has one signal per mode x fan x temperature

    def self.errors_for(config)
      data = config.signal_data
      return ["must be an object"] unless data.is_a?(Hash)

      cmds = data["commands"]
      return ["needs a commands object"] unless cmds.is_a?(Hash) && cmds.any?
      limit = data["ac"].is_a?(Hash) ? MAX_AC_STATES : MAX_COMMANDS
      return ["has too many commands (max #{limit})"] if cmds.size > limit

      case config.protocol
      when "ir" then ir_errors(cmds)
      when "wifi" then wifi_errors(data)
      when "ble" then cmds.values.all?(String) ? [] : ["ble commands must be hex strings"]
      when "bluetooth_hid" then cmds.values.all? { |v| v.is_a?(Integer) || v.is_a?(Hash) } ? [] : ["hid commands must be usage codes"]
      else []
      end
    end

    def self.ir_errors(cmds)
      cmds.each do |name, sig|
        return ["#{name}: must be an object"] unless sig.is_a?(Hash)
        next if sig.key?("broadlink") # compact packet form, used by AC state tables
        return ["#{name}: frequency must be 10000-60000 Hz"] unless sig["frequency"].is_a?(Integer) && sig["frequency"].between?(10_000, 60_000)
        pat = sig["pattern"]
        ok = pat.is_a?(Array) && pat.size.between?(2, MAX_PATTERN) && pat.all? { |n| n.is_a?(Integer) && n.positive? }
        return ["#{name}: pattern must be 2-#{MAX_PATTERN} positive integers (microseconds)"] unless ok
      end
      []
    end

    def self.wifi_errors(data)
      data["driver"].present? ? [] : ["wifi needs a driver"]
    end
  end
end

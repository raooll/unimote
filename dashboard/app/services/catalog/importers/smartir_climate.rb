require "json"

module Catalog
  module Importers
    # Imports SmartIR climate (air conditioner) code sets (https://github.com/smartHomeHub/SmartIR, MIT).
    # Unlike a button-per-key remote, an AC code set is a table of FULL STATES, one signal per
    # mode x fan speed x temperature, because ACs transmit their whole setting on every press.
    #
    # Stored as signal_data = {
    #   "ac" => { "modes" => { "cool" => { "fans" => ["low","auto"], "temps" => ["16",...,"30"] }, ... },
    #             "min_temp" => 16, "max_temp" => 30, "step" => 1 },
    #   "commands" => { "OFF" => {"broadlink"=>"JgC..."}, "COOL_AUTO_24" => {"broadlink"=>"..."}, ... }
    # }
    # Keys are normalised (UPPER_SNAKE): OFF, <MODE>_<FAN>_<TEMP>, <MODE>_<FAN> (no temps) or <MODE>.
    # Signals are kept as compact Broadlink base64 and decoded on demand (by the app, or by the hub natively).
    #
    # Skipped: Xiaomi codes (proprietary compressed format) and code sets with more than MAX_STATES states.
    class SmartirClimate
      MAX_STATES = SignalSchema::MAX_AC_STATES
      SOURCE = "smartir".freeze

      Stats = Struct.new(:files, :created, :updated, :unchanged, :skipped, :reasons, keyword_init: true)
      attr_reader :stats

      def initialize(root, logger: nil)
        @root = Pathname(root)
        @logger = logger
        @stats = Stats.new(files: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, reasons: Hash.new(0))
      end

      def call
        Categories.seed!
        category = DeviceCategory.find_by!(slug: "ac")
        Dir.glob(@root.join("codes", "climate", "*.json")).sort.each { |f| import_file(Pathname(f), category) }
        stats
      end

      def self.key(*parts) = parts.compact.map { |p| p.to_s.upcase.gsub(/[^A-Z0-9]+/, "_").gsub(/\A_|_\z/, "") }.reject(&:empty?).join("_")

      private

      def import_file(path, category)
        stats.files += 1
        data = JSON.parse(path.read)
        return skip("not an object") unless data.is_a?(Hash) && data["commands"].is_a?(Hash)
        return skip("controller #{data['supportedController']}") unless %w[Broadlink ESPHome LOOKin].include?(data["supportedController"])

        commands, modes = flatten(data["commands"], data["supportedController"])
        return skip("no usable states") if commands.size < 2
        return skip("more than #{MAX_STATES} states") if commands.size > MAX_STATES

        brand_name = data["manufacturer"].to_s.squish.presence or return skip("no manufacturer")
        models = Array(data["supportedModels"]).map { |m| m.to_s.squish }.reject(&:empty?)
        model_name = (models.join(", ").presence || "Code set #{path.basename('.json')}").truncate(480)
        signal_data = {
          "ac" => { "modes" => modes, "min_temp" => data["minTemperature"], "max_temp" => data["maxTemperature"], "step" => data["precision"] || 1 }.compact,
          "commands" => commands
        }
        upsert(path.basename(".json").to_s, category, brand_name, model_name, signal_data)
      rescue JSON::ParserError
        skip("invalid JSON")
      rescue ActiveRecord::RecordInvalid => e
        skip("invalid: #{e.message}")
      end

      # SmartIR commands: "off" => signal, then <mode> => { <fan> => { [<swing> =>] { <temp> => signal } } }. Shallower
      # trees (fan => signal, or mode => signal) also exist. Keys are <MODE>[_<FAN>][_<SWING>][_<TEMP>].
      def flatten(raw, controller)
        commands = {}
        modes = {}
        raw.each do |mode, tree|
          if %w[off on].include?(mode)
            put(commands, self.class.key(mode), tree, controller)
            next
          end

          info = { "fans" => [], "swings" => [], "temps" => [] }
          walk(tree, [mode], controller, commands, info)
          next unless commands.keys.any? { |k| k == self.class.key(mode) || k.start_with?("#{self.class.key(mode)}_") }

          modes[mode] = info.transform_values { |v| v.uniq.then { |u| u.all? { |x| x.to_s.match?(/\A-?\d+(\.\d+)?\z/) } ? u.sort_by(&:to_f) : u } }.reject { |_, v| v.empty? }
        end
        [commands, modes]
      end

      # A leaf's depth says what its levels mean: [mode, fan], [mode, fan, temp] or [mode, fan, swing, temp].
      def walk(node, path, controller, commands, info)
        if node.is_a?(Hash)
          node.each { |name, child| walk(child, path + [name], controller, commands, info) }
        elsif put(commands, self.class.key(*path), node, controller)
          info["fans"] << path[1] if path.size >= 2
          info["swings"] << path[2] if path.size == 4
          info["temps"] << path.last if path.size >= 3
        end
      end

      def put(commands, key, value, controller)
        b64 = to_broadlink(value, controller)
        return false unless b64 && key.present?

        commands[key] = { "broadlink" => b64 }
        true
      end

      def to_broadlink(value, controller)
        value = value.first if value.is_a?(Array) # a few files list alternatives; the first is the primary
        return nil unless value.is_a?(String) && value.present?

        case controller
        when "Broadlink" then Broadlink.decode(value) ? value.delete("\n ") : nil
        when "ESPHome" then (p = JSON.parse(value).map { |n| n.to_i.abs }) && p.size >= 2 && p.all?(&:positive?) ? Broadlink.encode(p) : nil
        when "LOOKin" then (p = value.split.map { |n| n.to_i.abs }) && p.size >= 2 && p.all?(&:positive?) ? Broadlink.encode(p) : nil
        end
      rescue JSON::ParserError
        nil
      end

      def upsert(code, category, brand_name, model_name, signal_data)
        ActiveRecord::Base.transaction do
          brand = Brand.find_or_create_by!(slug: brand_name.parameterize) { |b| b.name = brand_name }
          model = RemoteModel.find_or_create_by!(brand: brand, device_category: category, slug: "smartir-#{code}") do |m|
            m.name = model_name
            m.source = SOURCE
          end
          config = RemoteConfig.find_or_initialize_by(external_id: "smartir:climate/#{code}")
          checksum = Digest::SHA256.hexdigest(signal_data.to_json)[0, 16]
          if config.persisted? && config.checksum == checksum
            stats.unchanged += 1
            return
          end

          creating = config.new_record?
          config.assign_attributes(
            remote_model: model, protocol: "ir", variant: "smartir #{code}", source: SOURCE, layout_template: "ac_state",
            signal_data: signal_data, status: "published", popularity: 20
          )
          config.version += 1 unless creating
          config.save!
          creating ? stats.created += 1 : stats.updated += 1
        end
      end

      def skip(reason)
        stats.skipped += 1
        stats.reasons[reason] += 1
        nil
      end
    end
  end
end

require "digest"

module Catalog
  module Importers
    # Imports https://github.com/Lucaslhm/Flipper-IRDB (CC0) into the catalog.
    # Idempotent: configs are keyed by external_id ("flipper:<relative path>"); unchanged files
    # are skipped, changed ones are updated and their version is bumped.
    #
    #   Catalog::Importers::FlipperIrdb.new("/path/to/Flipper-IRDB").call
    class FlipperIrdb
      # Flipper-IRDB top-level folder -> our category slug. Folders not listed are ignored.
      FOLDERS = {
        "TVs" => "tv", "Universal_TV_Remotes" => "tv", "ACs" => "ac", "Streaming_Devices" => "streaming",
        "Cable_Boxes" => "cable_box", "SoundBars" => "soundbar", "Audio_and_Video_Receivers" => "av_receiver",
        "Speakers" => "speaker", "Projectors" => "projector", "LED_Lighting" => "led_lighting", "Fans" => "fan",
        "Air_Purifiers" => "air_purifier", "Humidifiers" => "humidifier", "Heaters" => "heater",
        "DVD_Players" => "dvd_player", "Blu-Ray" => "blu_ray", "Consoles" => "console", "Monitors" => "monitor",
        "TV_Tuner" => "tv_tuner", "DVB-T" => "tv_tuner", "CD_Players" => "cd_player", "VCR" => "vcr"
      }.freeze

      MIN_COMMANDS_TO_PUBLISH = 2

      Stats = Struct.new(:files, :created, :updated, :unchanged, :skipped, :unsupported_protocols, keyword_init: true)

      attr_reader :stats

      def initialize(root, only: nil, logger: nil)
        @root = Pathname(root)
        @only = Array(only).presence
        @logger = logger
        @stats = Stats.new(files: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, unsupported_protocols: Hash.new(0))
      end

      def call
        Categories.seed!
        FOLDERS.each do |folder, slug|
          next if @only && !@only.include?(folder)

          dir = @root.join(folder)
          next unless dir.directory?

          category = DeviceCategory.find_by!(slug: slug)
          Dir.glob(dir.join("**/*.ir")).sort.each { |file| import_file(Pathname(file), category) }
          log "#{folder}: done"
        end
        stats
      end

      private

      def import_file(path, category)
        stats.files += 1
        rel = path.relative_path_from(@root).to_s
        parsed = parse(path.read(encoding: "UTF-8", invalid: :replace, undef: :replace))
        commands, original, labels = build_commands(parsed)
        if commands.empty?
          stats.skipped += 1
          return
        end

        brand_name, model_name = names_for(path, category)
        signal_data = { "commands" => commands, "original" => original, "labels" => labels }.compact_blank
        upsert(rel, category, brand_name, model_name, signal_data, commands.keys)
      rescue ActiveRecord::RecordInvalid => e
        stats.skipped += 1
        log "SKIP #{rel}: #{e.message}"
      end

      def upsert(rel, category, brand_name, model_name, signal_data, keys)
        ActiveRecord::Base.transaction do
          brand = Brand.find_or_create_by!(slug: brand_name.parameterize) { |b| b.name = brand_name }
          model = RemoteModel.find_or_create_by!(brand: brand, device_category: category, slug: model_name.parameterize.presence || "default") do |m|
            m.name = model_name
            m.source = source_tag
          end
          config = RemoteConfig.find_or_initialize_by(external_id: "flipper:#{rel}")
          checksum = Digest::SHA256.hexdigest(signal_data.to_json)[0, 16]
          if config.persisted? && config.checksum == checksum
            stats.unchanged += 1
            return
          end

          creating = config.new_record?
          config.assign_attributes(
            remote_model: model, protocol: "ir", variant: File.basename(rel, ".ir"), source: source_tag,
            layout_template: Layouts.for_category(category.slug), signal_data: signal_data,
            status: keys.size >= MIN_COMMANDS_TO_PUBLISH ? "published" : "draft",
            popularity: popularity_for(keys)
          )
          config.version += 1 unless creating
          config.save!
          creating ? stats.created += 1 : stats.updated += 1
        end
      end

      # Brand = first folder under the category; model = file name without brand prefix.
      def names_for(path, category)
        parts = path.relative_path_from(@root).each_filename.to_a
        brand_dir = parts.size > 2 ? parts[1] : "Generic"
        brand = brand_dir.tr("_", " ").strip
        base = File.basename(path.to_s, ".ir")
        model = base.sub(/\A#{Regexp.escape(brand_dir)}[_\- ]*/i, "").tr("_", " ").strip
        model = "Default" if model.blank?
        [brand, model]
      end

      def source_tag = "flipper_irdb"
      def popularity_for(keys) = keys.count { |k| ButtonNames.canonical?(k) }

      def build_commands(blocks)
        commands = {}
        original = {}
        labels = {}
        blocks.each do |b|
          key = ButtonNames.normalize(b["name"])
          next if key.empty? || commands.key?(key)

          signal =
            if b["type"] == "raw" then raw_signal(b)
            elsif b["type"] == "parsed" then parsed_signal(b, original, key)
            end
          next unless signal

          commands[key] = signal
          labels[key] = b["name"] unless b["name"].to_s.upcase.tr(" ", "_") == key
        end
        [commands, original, labels]
      end

      def raw_signal(b)
        freq = b["frequency"].to_i
        pattern = b["data"].to_s.split.map(&:to_i)
        return nil unless freq.between?(10_000, 60_000) && pattern.size.between?(2, Catalog::SignalSchema::MAX_PATTERN) && pattern.all?(&:positive?)

        { "frequency" => freq, "duty_cycle" => (b["duty_cycle"] || 0.33).to_f.round(2), "pattern" => pattern }
      end

      def parsed_signal(b, original, key)
        protocol = b["protocol"].to_s
        unless IrEncoder.supported?(protocol)
          stats.unsupported_protocols[protocol] += 1
          return nil
        end
        address = le_int(b["address"])
        command = le_int(b["command"])
        signal = IrEncoder.encode(protocol, address, command)
        original[key] = { "protocol" => protocol, "address" => b["address"], "command" => b["command"] } if signal
        signal
      end

      # "04 00 00 00" -> 4 (little endian)
      def le_int(hex)
        hex.to_s.split.each_with_index.sum { |byte, i| byte.to_i(16) << (8 * i) }
      end

      # Flipper .ir: blocks separated by "#" lines, "key: value" pairs.
      def parse(text)
        blocks = []
        current = {}
        text.each_line do |line|
          line = line.strip
          if line.start_with?("#")
            blocks << current if current["name"]
            current = {}
          elsif (m = line.match(/\A([a-z_]+):\s*(.*)\z/))
            current[m[1]] = m[2]
          end
        end
        blocks << current if current["name"]
        blocks
      end

      def log(msg)
        @logger&.call(msg)
      end
    end
  end
end

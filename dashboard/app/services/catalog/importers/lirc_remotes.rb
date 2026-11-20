module Catalog
  module Importers
    # Imports the LIRC remotes database (https://lirc-remotes.sourceforge.net): `.lircd.conf` files with
    # either space-encoded codes (header / one / zero / ptrail, pre_data + code bits) or raw timings.
    #
    # Skipped: bi-phase encodings (RC5, RC6, ...), whose bit timing could not be verified without hardware, and
    # protocols that need special handling (SHIFT_ENC, XMP, RCMM, GRUNDIG).
    # Everything is tagged source "lirc" (below curated remotes; kept out of the committed snapshot) because the
    # database carries no explicit licence statement; get that confirmed before shipping it.
    #
    #   Catalog::Importers::LircRemotes.new("/path/to/lirc-remotes").call
    class LircRemotes
      SOURCE = "lirc".freeze
      MIN_COMMANDS = 2
      SUPPORTED_FLAGS = %w[SPACE_ENC CONST_LENGTH REVERSE NO_HEAD_REP NO_FOOT_REP].freeze
      Stats = Struct.new(:files, :remotes, :created, :updated, :unchanged, :skipped, :reasons, keyword_init: true)

      attr_reader :stats

      def initialize(root, logger: nil)
        @root = Pathname(root)
        @logger = logger
        @stats = Stats.new(files: 0, remotes: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, reasons: Hash.new(0))
      end

      def call
        Categories.seed!
        Dir.glob(@root.join("remotes", "**", "*.conf")).sort.each { |f| import_file(Pathname(f)) }
        stats
      end

      ALIASES = {
        "VOLUMEUP" => "VOL_UP", "VOLUMEDOWN" => "VOL_DOWN", "VOLUP" => "VOL_UP", "VOLDOWN" => "VOL_DOWN",
        "CHANNELUP" => "CH_UP", "CHANNELDOWN" => "CH_DOWN", "CHUP" => "CH_UP", "CHDOWN" => "CH_DOWN",
        "FASTFORWARD" => "FAST_FORWARD", "PLAYPAUSE" => "PLAY", "NEXTSONG" => "NEXT", "PREVIOUSSONG" => "PREVIOUS",
        "CHANNEL" => "CH_UP", "EJECTCD" => "EJECT", "POWER2" => "POWER"
      }.freeze

      def self.button_key(name)
        n = name.to_s.sub(/\AKEY_|\ABTN_/i, "")
        ALIASES[n.upcase.delete("_")] || ButtonNames.normalize(n)
      end

      # --- encoding -------------------------------------------------------------------------------------------

      # Parsed remote hash -> { "KEY" => {"frequency","duty_cycle","pattern"} } or [nil, reason]
      def self.encode_remote(remote)
        flags = remote[:flags]
        return [nil, "no codes"] if remote[:codes].empty? && remote[:raw].empty?
        return [nil, "unsupported encoding #{(flags - SUPPORTED_FLAGS - ['RAW_CODES']).join('|')}"] if (flags - SUPPORTED_FLAGS - ["RAW_CODES"]).any?

        freq = remote[:frequency].to_i.between?(10_000, 60_000) ? remote[:frequency].to_i : Broadlink::CARRIER_HZ
        commands = {}
        remote[:raw].each { |name, durations| (p = raw_pattern(durations)) && commands[button_key(name)] ||= signal(freq, p) }
        remote[:codes].each { |name, value| (p = space_pattern(remote, value)) && commands[button_key(name)] ||= signal(freq, p) }
        [commands.compact_blank, nil]
      end

      def self.signal(freq, pattern) = { "frequency" => freq, "duty_cycle" => 0.33, "pattern" => pattern }

      # Raw timings alternate pulse/space starting with a pulse; end on a space.
      def self.raw_pattern(durations)
        d = durations.map(&:abs)
        d << 20_000 if d.size.odd?
        d.size.between?(2, SignalSchema::MAX_PATTERN) && d.all?(&:positive?) ? d : nil
      end

      def self.space_pattern(r, code)
        bits = r[:bits].to_i
        return nil if bits <= 0 || !r[:one] || !r[:zero]

        seq = [] # [:p|:s, microseconds]
        seq << [:p, r[:plead]] if r[:plead].to_i.positive?
        seq << [:p, r[:header][0]] << [:s, r[:header][1]] if r[:header]
        data = [[r[:pre_data], r[:pre_data_bits].to_i], [code, bits], [r[:post_data], r[:post_data_bits].to_i]]
        data.each do |value, n|
          next if n <= 0
          bit_order = (0...n).to_a
          bit_order.reverse! unless r[:flags].include?("REVERSE") # LIRC sends MSB first unless REVERSE
          bit_order.each do |i|
            pulse, space = (value.to_i >> i) & 1 == 1 ? r[:one] : r[:zero]
            seq << [:p, pulse] << [:s, space]
          end
        end
        seq << [:p, r[:foot][0]] << [:s, r[:foot][1]] if r[:foot]
        seq << [:p, r[:ptrail]] if r[:ptrail].to_i.positive?
        seq << [:s, r[:gap].to_i.positive? ? r[:gap] : 20_000]

        # merge neighbours of the same kind (a zero-length pulse or space can leave two spaces in a row)
        merged = []
        seq.each do |kind, us|
          next if us.to_i <= 0
          if merged.last && merged.last[0] == kind then merged.last[1] += us else merged << [kind, us] end
        end
        merged.shift while merged.first && merged.first[0] == :s
        pattern = merged.map(&:last)
        pattern.size.between?(2, SignalSchema::MAX_PATTERN) ? pattern : nil
      end

      # --- parsing --------------------------------------------------------------------------------------------

      HEADER_COMMENT = {
        brand: /^#\s*brand:\s*(.+?)\s*$/i, model: /^#\s*model(?: no\.? of remote control)?:\s*(.+?)\s*$/i,
        device: /^#\s*devices? being controlled by this remote:\s*(.+?)\s*$/i
      }.freeze

      def self.parse(text)
        meta = HEADER_COMMENT.transform_values { |re| text[re, 1].to_s.strip.sub(/\A#+\s*/, "").presence }
        remotes = []
        text.scan(/begin remote(.*?)end remote/m).flatten.each { |body| remotes << parse_remote(body) }
        [meta, remotes]
      end

      def self.num(str) = str.to_s.strip.then { |s| s.start_with?("0x", "0X") ? s.to_i(16) : s.to_i }

      def self.parse_remote(body)
        r = { flags: [], codes: {}, raw: {} }
        codes_part = body[/begin codes(.*?)end codes/m, 1]
        raw_part = body[/begin raw_codes(.*?)end raw_codes/m, 1]
        head = body.sub(/begin codes.*?end codes/m, "").sub(/begin raw_codes.*?end raw_codes/m, "")
        head.each_line do |line|
          line = line.sub(/#.*/, "").strip
          next if line.empty?

          key, *vals = line.split
          case key
          when "name" then r[:name] = vals.join(" ")
          when "flags" then r[:flags] = vals.join.split("|").map(&:upcase)
          when "bits", "pre_data_bits", "post_data_bits", "frequency", "gap", "ptrail", "plead" then r[key.to_sym] = num(vals.first)
          when "pre_data", "post_data" then r[key.to_sym] = num(vals.first)
          when "header", "one", "zero", "foot" then r[key.to_sym] = vals.first(2).map { |v| num(v) } if vals.size >= 2
          end
        end
        codes_part&.each_line do |line|
          name, value = line.sub(/#.*/, "").strip.split
          r[:codes][name] = num(value) if name && value&.match?(/\A(0x[0-9a-f]+|\d+)\z/i)
        end
        if raw_part
          current = nil
          raw_part.each_line do |line|
            line = line.sub(/#.*/, "").strip
            if line.start_with?("name") then current = line.split(/\s+/, 2)[1].to_s.strip; r[:raw][current] = []
            elsif current && !line.empty? then r[:raw][current].concat(line.split.grep(/\A-?\d+\z/).map(&:to_i))
            end
          end
        end
        r[:flags] << "RAW_CODES" if raw_part && r[:flags].empty?
        r
      end

      # --- import ---------------------------------------------------------------------------------------------

      private

      def import_file(path)
        stats.files += 1
        text = path.binread.force_encoding(Encoding::ISO_8859_1).encode(Encoding::UTF_8) # old files are Latin-1; never invalid
        meta, remotes = self.class.parse(text)
        return skip("no remote block") if remotes.empty?

        brand = (meta[:brand] || path.dirname.basename.to_s).tr("_", " ").squish
        brand = path.dirname.basename.to_s.tr("_", " ").squish if brand.blank? || brand.match?(/\A(unknown|n\/?a|\?+)\z/i)
        model_base = (meta[:model] || path.basename.to_s.sub(/\.lircd\.conf\z|\.conf\z/, "")).tr("_", " ").squish
        remotes.each_with_index do |remote, i|
          stats.remotes += 1
          commands, reason = self.class.encode_remote(remote)
          next skip(reason) unless commands

          return_if_few = commands.size < MIN_COMMANDS
          next skip("fewer than #{MIN_COMMANDS} usable buttons") if return_if_few

          model = remotes.size > 1 ? "#{model_base} (#{remote[:name].to_s.tr('_', ' ')})" : model_base
          slug = CategoryGuess.from_text([meta[:device], model, brand].compact.join(" ")) || CategoryGuess.from_buttons(commands.keys) || "other"
          upsert("lirc:#{path.relative_path_from(@root)}##{i}", slug, brand, model.truncate(200), { "commands" => commands })
        end
      rescue ActiveRecord::RecordInvalid => e
        skip("invalid: #{e.message.truncate(80)}")
      end

      def upsert(external_id, category_slug, brand_name, model_name, signal_data)
        category = DeviceCategory.find_by!(slug: category_slug)
        ActiveRecord::Base.transaction do
          brand = Brand.find_or_create_by!(slug: brand_name.parameterize.presence || "unknown") { |b| b.name = brand_name }
          model = RemoteModel.find_or_create_by!(brand: brand, device_category: category, slug: model_name.parameterize.presence || "default") { |m| m.name = model_name; m.source = SOURCE }
          config = RemoteConfig.find_or_initialize_by(external_id: external_id)
          checksum = Digest::SHA256.hexdigest(signal_data.to_json)[0, 16]
          if config.persisted? && config.checksum == checksum
            stats.unchanged += 1
            return
          end

          creating = config.new_record?
          config.assign_attributes(
            remote_model: model, protocol: "ir", variant: external_id.split("/").last.to_s.sub(/\.lircd\.conf.*/, ""), source: SOURCE,
            layout_template: Layouts.for_category(category.slug), signal_data: signal_data, status: "published",
            popularity: signal_data["commands"].keys.count { |k| ButtonNames.canonical?(k) } / 2
          )
          config.version += 1 unless creating
          config.save!
          creating ? stats.created += 1 : stats.updated += 1
        end
      end

      def skip(reason)
        stats.skipped += 1
        stats.reasons[reason.to_s.truncate(40)] += 1
        nil
      end
    end
  end
end

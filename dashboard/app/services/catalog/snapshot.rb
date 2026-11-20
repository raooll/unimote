require "zlib"
require "json"

module Catalog
  # Portable catalog dump (categories, brands, models, configs) as gzipped NDJSON.
  # Used to ship the same data to production:  rake catalog:export  ->  commit/upload the file
  #  -> on prod: rake catalog:import
  #
  # Import is idempotent and non-destructive:
  #   * rows are matched by stable keys (slugs / external_id), never by database ids
  #   * live data (popularity, success/failure counts) and an admin's publish/unpublish
  #     decision are only set when a row is created, never overwritten
  module Snapshot
    DEFAULT_PATH = Rails.root.join("db/data/catalog.ndjson.gz")
    FORMAT = 1
    # Sources kept out of the committed snapshot: the AC state tables are tens of MB, and the converted data awaits a
    # licensing decision. Import them on the target with their own rake tasks, or export with INCLUDE_SOURCES=smartir,...
    EXCLUDED_SOURCES = %w[flipper_converted smartir lirc].freeze

    module_function

    def export(path = DEFAULT_PATH, include_sources: [])
      excluded = EXCLUDED_SOURCES - Array(include_sources)
      path = Pathname(path)
      path.dirname.mkpath
      counts = Hash.new(0)
      Zlib::GzipWriter.open(path.to_s, Zlib::BEST_COMPRESSION) do |gz|
        line = ->(type, hash) { gz.puts({ "t" => type }.merge(hash).to_json); counts[type] += 1 }
        gz.puts({ "t" => "meta", "format" => FORMAT, "exported_at" => Time.current.iso8601 }.to_json)
        DeviceCategory.order(:position).find_each do |c|
          line.("category", c.slice(:slug, :name, :icon, :position, :default_layout, :active))
        end
        Brand.order(:slug).find_each { |b| line.("brand", b.slice(:slug, :name, :website)) }
        RemoteModel.where.not(source: excluded).includes(:brand, :device_category).order(:id).find_each do |m|
          line.("model", { "brand" => m.brand.slug, "category" => m.device_category.slug, "slug" => m.slug,
                           "name" => m.name, "source" => m.source })
        end
        RemoteConfig.includes(remote_model: %i[brand device_category]).where.not(external_id: nil).where.not(source: excluded).order(:id).find_each do |c|
          m = c.remote_model
          line.("config", { "external_id" => c.external_id, "brand" => m.brand.slug, "category" => m.device_category.slug,
                            "model" => m.slug, "protocol" => c.protocol, "variant" => c.variant,
                            "layout_template" => c.layout_template, "status" => c.status, "source" => c.source,
                            "version" => c.version, "popularity" => c.popularity, "signal_data" => c.signal_data })
        end
      end
      counts.merge("bytes" => path.size)
    end

    def import(path = DEFAULT_PATH, logger: nil)
      path = Pathname(path)
      raise "Snapshot not found: #{path}" unless path.exist?

      counts = Hash.new(0)
      brands = {}
      categories = {}
      models = {}
      Zlib::GzipReader.open(path.to_s) do |gz|
        gz.each_line do |raw|
          row = JSON.parse(raw)
          case row["t"]
          when "meta" then raise "Unsupported snapshot format #{row['format']}" if row["format"] != FORMAT
          when "category" then import_category(row, categories, counts)
          when "brand" then import_brand(row, brands, counts)
          when "model" then import_model(row, brands, categories, models, counts)
          when "config" then import_config(row, brands, categories, models, counts)
          end
        end
      end
      logger&.call(counts.inspect)
      counts
    end

    def import_category(row, categories, counts)
      c = DeviceCategory.find_or_initialize_by(slug: row["slug"])
      counts[c.new_record? ? "categories_created" : "categories_existing"] += 1
      c.assign_attributes(row.slice("name", "icon", "position", "default_layout", "active"))
      c.save! if c.changed?
      categories[row["slug"]] = c
    end

    def import_brand(row, brands, counts)
      b = Brand.find_or_initialize_by(slug: row["slug"])
      counts[b.new_record? ? "brands_created" : "brands_existing"] += 1
      b.assign_attributes(row.slice("name", "website"))
      b.save! if b.changed?
      brands[row["slug"]] = b
    end

    def import_model(row, brands, categories, models, counts)
      brand = brands.fetch(row["brand"])
      category = categories.fetch(row["category"])
      m = RemoteModel.find_or_initialize_by(brand: brand, device_category: category, slug: row["slug"])
      counts[m.new_record? ? "models_created" : "models_existing"] += 1
      m.assign_attributes(name: row["name"], source: row["source"])
      m.save! if m.changed?
      models[[row["brand"], row["category"], row["slug"]]] = m
    end

    def import_config(row, brands, categories, models, counts)
      model = models.fetch([row["brand"], row["category"], row["model"]])
      c = RemoteConfig.find_or_initialize_by(external_id: row["external_id"])
      creating = c.new_record?
      checksum = Digest::SHA256.hexdigest(row["signal_data"].to_json)[0, 16]
      unless creating || c.checksum != checksum
        counts["configs_unchanged"] += 1
        return
      end

      c.assign_attributes(remote_model: model, protocol: row["protocol"], variant: row["variant"],
                          layout_template: row["layout_template"], source: row["source"], signal_data: row["signal_data"])
      if creating
        c.status = row["status"]
        c.popularity = row["popularity"]
        c.version = row["version"]
        counts["configs_created"] += 1
      else
        c.version = [c.version + 1, row["version"]].max
        counts["configs_updated"] += 1
      end
      c.save!
    end
  end
end

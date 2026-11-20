namespace :catalog do
  desc "Create/update the device categories"
  task categories: :environment do
    Catalog::Categories.seed!
    puts "Categories: #{DeviceCategory.count}"
  end

  desc "Import Flipper-IRDB (CC0). Usage: rake catalog:import_flipper[/path/to/Flipper-IRDB,TVs;ACs]"
  task :import_flipper, %i[path only] => :environment do |_t, args|
    abort "Usage: rake catalog:import_flipper[/path/to/Flipper-IRDB]" if args[:path].blank?

    only = args[:only].to_s.split(";").presence
    importer = Catalog::Importers::FlipperIrdb.new(args[:path], only: only, logger: ->(m) { puts m })
    stats = importer.call
    puts stats.to_h.except(:unsupported_protocols).inspect
    puts "Unsupported protocols skipped: #{stats.unsupported_protocols.sort_by { |_, v| -v }.to_h.inspect}"
  end
end

namespace :catalog do
  desc "Import the LIRC remotes database (space-encoded and raw codes). Usage: rake catalog:import_lirc[/path/to/lirc-remotes]"
  task :import_lirc, %i[path] => :environment do |_t, args|
    abort "Usage: rake catalog:import_lirc[/path/to/lirc-remotes]" if args[:path].blank?

    stats = Catalog::Importers::LircRemotes.new(args[:path]).call
    puts stats.to_h.except(:reasons).inspect
    puts "Skipped: #{stats.reasons.sort_by { |_, v| -v }.first(8).to_h.inspect}"
  end
end

namespace :catalog do
  desc "Import SmartIR AC state tables (MIT). Usage: rake catalog:import_smartir[/path/to/SmartIR]"
  task :import_smartir, %i[path] => :environment do |_t, args|
    abort "Usage: rake catalog:import_smartir[/path/to/SmartIR]" if args[:path].blank?

    stats = Catalog::Importers::SmartirClimate.new(args[:path]).call
    puts stats.to_h.except(:reasons).inspect
    puts "Skipped: #{stats.reasons.sort_by { |_, v| -v }.to_h.inspect}"
  end
end

namespace :catalog do
  desc "Import Flipper-IRDB's _Converted_ folder (category inferred). Usage: rake catalog:import_flipper_converted[/path/to/Flipper-IRDB,CSV;Pronto]"
  task :import_flipper_converted, %i[path only] => :environment do |_t, args|
    abort "Usage: rake catalog:import_flipper_converted[/path/to/Flipper-IRDB]" if args[:path].blank?

    stats = Catalog::Importers::FlipperConverted.new(args[:path], only: args[:only].to_s.split(";").presence, logger: ->(m) { puts m }).call
    puts stats.to_h.except(:unsupported_protocols).inspect
    puts "Unsupported protocols skipped: #{stats.unsupported_protocols.sort_by { |_, v| -v }.to_h.inspect}"
  end
end

namespace :catalog do
  desc "Create/refresh hand-written Wi-Fi, Bluetooth and BLE profiles"
  task profiles: :environment do
    Catalog::Profiles.seed!
    puts "Profiles: #{RemoteConfig.where.not(protocol: 'ir').count}"
  end

  desc "Export the catalog to db/data/catalog.ndjson.gz (or PATH=...)"
  task export: :environment do
    puts Catalog::Snapshot.export(ENV.fetch("PATH_OUT", Catalog::Snapshot::DEFAULT_PATH), include_sources: ENV["INCLUDE_SOURCES"].to_s.split(",")).inspect
  end

  desc "Import a catalog snapshot (idempotent). Defaults to db/data/catalog.ndjson.gz"
  task import: :environment do
    puts Catalog::Snapshot.import(ENV.fetch("PATH_IN", Catalog::Snapshot::DEFAULT_PATH)).inspect
  end

  desc "Categories + profiles + snapshot (if present). Safe to run on every deploy."
  task seed: :environment do
    Catalog::Categories.seed!
    Catalog::Profiles.seed!
    Catalog::Snapshot.import if Catalog::Snapshot::DEFAULT_PATH.exist?
    puts "Catalog: #{Brand.count} brands, #{RemoteModel.count} models, #{RemoteConfig.published.count} published configs"
  end
end

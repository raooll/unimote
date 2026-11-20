module Catalog
  # The device categories shown in the app (order = display order).
  module Categories
    ALL = [
      { slug: "tv",           name: "TV",                icon: "tv" },
      { slug: "ac",           name: "Air Conditioner",   icon: "snowflake" },
      { slug: "streaming",    name: "Streaming Device",  icon: "cast" },
      { slug: "cable_box",    name: "Set-top Box",       icon: "box" },
      { slug: "soundbar",     name: "Soundbar",          icon: "speaker" },
      { slug: "av_receiver",  name: "AV Receiver",       icon: "radio" },
      { slug: "speaker",      name: "Speaker",           icon: "volume-2" },
      { slug: "projector",    name: "Projector",         icon: "projector" },
      { slug: "led_lighting", name: "Light",             icon: "lightbulb" },
      { slug: "fan",          name: "Fan",               icon: "fan" },
      { slug: "air_purifier", name: "Air Purifier",      icon: "wind" },
      { slug: "humidifier",   name: "Humidifier",        icon: "droplets" },
      { slug: "heater",       name: "Heater",            icon: "flame" },
      { slug: "dvd_player",   name: "DVD Player",        icon: "disc" },
      { slug: "blu_ray",      name: "Blu-ray Player",    icon: "disc-3" },
      { slug: "console",      name: "Game Console",      icon: "gamepad-2" },
      { slug: "monitor",      name: "Monitor",           icon: "monitor" },
      { slug: "tv_tuner",     name: "TV Tuner / DVB-T",  icon: "antenna" },
      { slug: "cd_player",    name: "CD Player",         icon: "disc-2" },
      { slug: "vcr",          name: "VCR",               icon: "video" },
      { slug: "other",        name: "Other",             icon: "remote" }
    ].freeze

    # Categories whose brands also own uncategorised ("other") remotes: imported lists that name only a model
    # number. Auto-guessing their category measured under 80% accurate, so instead these remotes are listed after
    # the categorised ones, flagged `uncategorised`, rather than being misfiled.
    AV_FAMILY = %w[tv av_receiver cable_box dvd_player blu_ray cd_player vcr projector soundbar speaker tv_tuner monitor].freeze

    def self.slugs_with_other(slug) = AV_FAMILY.include?(slug.to_s) ? [slug.to_s, "other"] : [slug.to_s]

    def self.seed!
      ALL.each_with_index do |attrs, i|
        cat = DeviceCategory.find_or_initialize_by(slug: attrs[:slug])
        cat.assign_attributes(name: attrs[:name], icon: attrs[:icon], position: i,
                              default_layout: Layouts.for_category(attrs[:slug]))
        cat.save!
      end
    end
  end
end

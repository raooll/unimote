# Alba resources for the public API. Kept in one file: they are small and change together.
module Api
  module Resources
    class Category
      include Alba::Resource
      attributes :slug, :name, :icon, :position, :default_layout
      attribute(:models_count) { |c| params[:counts]&.fetch(c.id, 0) || 0 }
    end

    class Brand
      include Alba::Resource
      attributes :slug, :name
      attribute(:models_count) { |b| params[:counts]&.fetch(b.id, 0) }
    end

    class ConfigSummary
      include Alba::Resource
      attributes :id, :protocol, :variant, :layout_template, :version, :checksum, :popularity
      attribute(:success_rate) { |c| c.success_rate }
      attribute(:commands_count) { |c| c.signal_data.fetch("commands", {}).size }
    end

    class Model
      include Alba::Resource
      attributes :id, :slug, :name
      attribute(:label) { |m| m.label }
      attribute(:display_name) { |m| m.display_name }
      attribute(:brand) { |m| { slug: m.brand.slug, name: m.brand.name } }
      attribute(:category) { |m| m.device_category.slug }
      attribute(:uncategorised) { |m| m.device_category.slug == "other" }
      attribute(:configs) do |m|
        m.remote_configs.select(&:status_published?).sort_by { |c| -c.popularity }.map { |c| ConfigSummary.new(c).to_h }
      end
    end

    # Full remote including signal data. This is what the app downloads and stores offline.
    class Remote
      include Alba::Resource
      attributes :id, :protocol, :variant, :layout_template, :version, :checksum, :updated_at
      attribute(:name) { |c| c.remote_model.display_name }
      attribute(:brand) { |c| { slug: c.remote_model.brand.slug, name: c.remote_model.brand.name } }
      attribute(:model) { |c| { id: c.remote_model.id, slug: c.remote_model.slug, name: c.remote_model.name } }
      attribute(:category) { |c| c.remote_model.device_category.slug }
      attribute(:layout) { |c| c.layout_template && Catalog::Layouts::ALL[c.layout_template]&.slice(:name, :sections) }
      attribute(:signal_data) { |c| c.signal_data.except("original") }
    end

    class MatchCandidate
      include Alba::Resource
      attributes :id, :protocol, :variant, :layout_template, :version, :popularity
      attribute(:model) { |c| c.remote_model.label }
      attribute(:success_rate) { |c| c.success_rate }
      attribute(:shared_by) { |c| params[:shared]&.fetch(c.id, 0) || 0 }
      # One signal for the "does your device react?" test, so the wizard needs no full download.
      attribute(:test) do |c|
        cmds = c.signal_data["commands"] || {}
        key = %w[POWER POWER_ON POWER_OFF MUTE VOL_UP COOL_AUTO_24 COOL_AUTO_25 COOL_MID_24].find { |k| cmds[k] } || cmds.keys.first
        sig = cmds[key]
        sig = Catalog::Broadlink.signal(sig["broadlink"]) if sig.is_a?(Hash) && sig["broadlink"]
        { command: key, signal: sig } if key && sig
      end
    end

    class User
      include Alba::Resource
      attributes :id, :email, :name, :locale, :created_at
    end

    class Room
      include Alba::Resource
      attributes :client_uuid, :name, :icon, :position, :updated_at
    end

    class SavedRemote
      include Alba::Resource
      attributes :client_uuid, :name, :position, :settings, :remote_config_id, :updated_at
      attribute(:room_client_uuid) { |r| r.room&.client_uuid }
    end

    class Scene
      include Alba::Resource
      attributes :client_uuid, :name, :icon, :position, :steps, :updated_at
    end
  end
end

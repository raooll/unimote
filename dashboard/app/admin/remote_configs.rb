ActiveAdmin.register RemoteConfig do
  menu parent: "Catalog", priority: 4, label: "Remotes"
  permit_params :remote_model_id, :protocol, :variant, :layout_template, :status, :popularity, :signal_data_json

  scope :all, default: true
  scope :published
  scope("Draft") { |s| s.where(status: "draft") }
  scope("Archived") { |s| s.where(status: "archived") }
  scope("Needs attention") { |s| s.where("failure_count > success_count AND failure_count >= 3") }

  filter :remote_model_brand_id, as: :select, label: "Brand", collection: -> { Brand.ordered.pluck(:name, :id) }
  filter :remote_model_device_category_id, as: :select, label: "Category", collection: -> { DeviceCategory.ordered.pluck(:name, :id) }
  filter :protocol, as: :select, collection: RemoteConfig::PROTOCOLS
  filter :status, as: :select, collection: RemoteConfig::STATUSES
  filter :source
  filter :variant
  filter :popularity
  filter :updated_at

  controller do
    def scoped_collection = super.includes(remote_model: %i[brand device_category])
  end

  batch_action :publish do |ids|
    batch_action_collection.find(ids).each { |c| c.update!(status: "published") }
    redirect_to collection_path, notice: "Published #{ids.size} remote(s)"
  end
  batch_action :unpublish, confirm: "Move to draft? The app will stop offering these." do |ids|
    batch_action_collection.find(ids).each { |c| c.update!(status: "draft") }
    redirect_to collection_path, notice: "Moved #{ids.size} remote(s) to draft"
  end
  batch_action :archive, confirm: "Archive these remotes?" do |ids|
    batch_action_collection.find(ids).each { |c| c.update!(status: "archived") }
    redirect_to collection_path, notice: "Archived #{ids.size} remote(s)"
  end

  index do
    selectable_column
    id_column
    column("Remote") { |c| link_to c.remote_model.display_name, admin_remote_config_path(c) }
    column("Category") { |c| c.remote_model.device_category.name }
    column :protocol
    column :variant
    column(:status) { |c| status_tag c.status }
    column("Buttons") { |c| c.command_names.size }
    column :popularity
    column("Works") { |c| c.success_rate ? "#{(c.success_rate * 100).round}% (#{c.success_count + c.failure_count})" : "–" }
    column :version
    actions
  end

  show do
    attributes_table do
      row :id
      row("Remote") { |c| link_to c.remote_model.display_name, admin_remote_model_path(c.remote_model) }
      row :protocol
      row :variant
      row(:status) { |c| status_tag c.status }
      row :layout_template
      row :source
      row :external_id
      row :version
      row :checksum
      row :popularity
      row :success_count
      row :failure_count
      row :published_at
      row :updated_at
    end
    panel "Buttons (#{resource.command_names.size})" do
      labels = resource.signal_data["labels"] || {}
      table_for resource.command_names do
        column("Command") { |name| code name }
        column("Original label") { |name| labels[name] }
        column("In layout") do |name|
          in_layout = Catalog::Layouts::ALL[resource.layout_template.to_s].to_h.fetch(:sections, []).any? do |s|
            [*s[:buttons], *s[:rockers]&.flat_map { |r| [r[:up], r[:down]] }].compact.any? { |b| b[:key] == name }
          end
          status_tag(in_layout ? "yes" : "other", class: in_layout ? "ok" : "")
        end
      end
    end
    panel "Raw signal data (JSON)" do
      pre(style: "max-height: 420px; overflow: auto; white-space: pre-wrap;") { resource.signal_data_json.truncate(60_000) }
    end
  end

  form do |f|
    f.semantic_errors
    f.inputs do
      f.input :remote_model, collection: RemoteModel.includes(:brand).ordered.map { |m| [m.display_name, m.id] }
      f.input :protocol, as: :select, collection: RemoteConfig::PROTOCOLS, include_blank: false
      f.input :variant
      f.input :layout_template, as: :select, collection: Catalog::Layouts::KEYS
      f.input :status, as: :select, collection: RemoteConfig::STATUSES, include_blank: false
      f.input :popularity
      f.input :signal_data_json, as: :text, label: "Signal data (JSON)", input_html: { rows: 22, style: "font-family: monospace;" },
                                 hint: "Editing the signal data bumps the version so apps re-download it."
    end
    f.actions
  end

  controller do
    def update
      @remote_config = resource
      @remote_config.assign_attributes(permitted_params[:remote_config])
      @remote_config.version += 1 if @remote_config.signal_data_changed?
      @remote_config.save ? redirect_to(admin_remote_config_path(@remote_config), notice: "Remote updated") : render(:edit)
    end
  end
end

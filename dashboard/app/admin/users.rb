ActiveAdmin.register User do
  menu priority: 2, label: "App users"
  actions :index, :show, :edit, :update, :destroy # users self-register in the app
  permit_params :name, :locale

  scope :all, default: true
  scope("Active (7d)") { |s| s.where("last_seen_at > ?", 7.days.ago) }
  scope("New (7d)") { |s| s.where("created_at > ?", 7.days.ago) }

  filter :email
  filter :name
  filter :created_at
  filter :last_seen_at

  controller do
    def scoped_collection = super.includes(:rooms, :saved_remotes, :scenes)
  end

  index do
    selectable_column
    id_column
    column :email
    column :name
    column("Rooms") { |u| u.rooms.size }
    column("Remotes") { |u| u.saved_remotes.size }
    column("Scenes") { |u| u.scenes.size }
    column :last_seen_at
    column :created_at
    actions
  end

  show do
    attributes_table do
      row :id
      row :email
      row :name
      row :locale
      row :last_seen_at
      row :created_at
    end
    panel "Rooms (#{resource.rooms.count})" do
      table_for resource.rooms.order(:position) do
        column :name
        column :icon
        column("Remotes") { |r| r.saved_remotes.count }
      end
    end
    panel "Saved remotes (#{resource.saved_remotes.count})" do
      table_for resource.saved_remotes.includes(:room, remote_config: { remote_model: :brand }).order(:id) do
        column :name
        column("Room") { |r| r.room&.name }
        column("Catalog remote") do |r|
          r.remote_config ? link_to(r.remote_config.remote_model.display_name, admin_remote_config_path(r.remote_config)) : status_tag("custom")
        end
      end
    end
    panel "Scenes (#{resource.scenes.count})" do
      table_for resource.scenes.order(:position) do
        column :name
        column("Steps") { |s| s.steps.size }
      end
    end
  end

  form do |f|
    f.inputs "Profile" do
      f.input :email, input_html: { disabled: true }
      f.input :name
      f.input :locale
    end
    f.actions
  end
end

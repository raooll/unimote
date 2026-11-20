ActiveAdmin.register DeviceCategory do
  menu parent: "Catalog", priority: 1
  config.sort_order = "position_asc"
  permit_params :slug, :name, :icon, :position, :default_layout, :active

  filter :name
  filter :active

  index do
    id_column
    column :position
    column :name
    column :slug
    column :icon
    column :default_layout
    column :active
    column("Models") { |c| c.remote_models_count }
    actions
  end

  form do |f|
    f.inputs do
      f.input :name
      f.input :slug, hint: "Lowercase letters, digits and underscores. Used by the API and the app."
      f.input :icon
      f.input :position
      f.input :default_layout, as: :select, collection: Catalog::Layouts::KEYS, include_blank: false
      f.input :active
    end
    f.actions
  end
end

ActiveAdmin.register Brand do
  menu parent: "Catalog", priority: 2
  config.sort_order = "name_asc"
  permit_params :name, :slug, :website

  filter :name
  filter :slug
  filter :created_at

  index do
    id_column
    column :name
    column :slug
    column("Models") { |b| b.remote_models_count }
    column :website
    actions
  end

  form do |f|
    f.inputs do
      f.input :name
      f.input :slug, hint: "Leave empty to generate from the name."
      f.input :website
    end
    f.actions
  end
end

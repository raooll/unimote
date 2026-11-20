ActiveAdmin.register RemoteModel do
  menu parent: "Catalog", priority: 3
  permit_params :brand_id, :device_category_id, :name, :slug, :source

  filter :brand, collection: -> { Brand.ordered }
  filter :device_category, label: "Category"
  filter :name
  filter :source, as: :select, collection: RemoteModel::SOURCES
  filter :created_at

  controller do
    def scoped_collection = super.includes(:brand, :device_category)
  end

  index do
    id_column
    column :brand
    column :name
    column :device_category
    column :source
    column("Remotes") { |m| m.remote_configs_count }
    actions
  end

  show do
    attributes_table do
      row :brand
      row :name
      row :slug
      row :device_category
      row :source
    end
    panel "Remotes" do
      table_for resource.remote_configs.order(popularity: :desc) do
        column("ID") { |c| link_to c.id, admin_remote_config_path(c) }
        column :protocol
        column :variant
        column(:status) { |c| status_tag c.status }
        column :popularity
      end
    end
  end

  form do |f|
    f.inputs do
      f.input :brand, collection: Brand.ordered
      f.input :device_category, collection: DeviceCategory.ordered
      f.input :name
      f.input :slug, hint: "Leave empty to generate from the name."
      f.input :source, as: :select, collection: RemoteModel::SOURCES, include_blank: false
    end
    f.actions
  end
end

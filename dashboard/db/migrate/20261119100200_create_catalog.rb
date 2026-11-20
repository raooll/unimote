# The remote catalog: category -> brand -> model -> config(s).
class CreateCatalog < ActiveRecord::Migration[8.0]
  def change
    create_table :device_categories do |t|
      t.string :slug, null: false
      t.string :name, null: false
      t.string :icon
      t.integer :position, null: false, default: 0
      t.string :default_layout
      t.boolean :active, null: false, default: true
      t.integer :remote_models_count, null: false, default: 0
      t.timestamps
    end
    add_index :device_categories, :slug, unique: true

    create_table :brands do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :website
      t.integer :remote_models_count, null: false, default: 0
      t.timestamps
    end
    add_index :brands, :slug, unique: true
    add_index :brands, "lower(name)", name: "index_brands_on_lower_name"

    create_table :remote_models do |t|
      t.references :brand, null: false, foreign_key: true
      t.references :device_category, null: false, foreign_key: true
      t.string :name, null: false
      t.string :slug, null: false
      t.string :source, null: false, default: "manual" # manual | flipper_irdb | community
      t.integer :remote_configs_count, null: false, default: 0
      t.timestamps
    end
    add_index :remote_models, %i[brand_id device_category_id slug], unique: true,
              name: "index_remote_models_unique_per_brand_category"

    create_table :remote_configs do |t|
      t.references :remote_model, null: false, foreign_key: true
      t.string :protocol, null: false          # ir | wifi | ble | bluetooth_hid
      t.string :variant, null: false           # e.g. file name / "default"
      t.string :layout_template                # ui layout key, see Catalog::Layouts
      t.jsonb :signal_data, null: false, default: {}
      t.string :status, null: false, default: "draft" # draft | published | archived
      t.string :source, null: false, default: "manual"
      t.string :external_id                    # stable key for idempotent imports
      t.string :checksum
      t.integer :version, null: false, default: 1
      t.integer :popularity, null: false, default: 0
      t.integer :success_count, null: false, default: 0
      t.integer :failure_count, null: false, default: 0
      t.datetime :published_at
      t.timestamps
    end
    add_index :remote_configs, :external_id, unique: true
    add_index :remote_configs, %i[status protocol]
    add_index :remote_configs, :popularity
  end
end

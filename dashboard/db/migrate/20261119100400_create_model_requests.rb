class CreateModelRequests < ActiveRecord::Migration[8.0]
  def change
    # "Please add this brand/model": one row per (brand, model, category); repeat requests bump the count.
    create_table :model_requests do |t|
      t.string :brand_name, null: false
      t.string :model_name_text, null: false, default: ""
      t.string :category_slug, null: false
      t.string :key, null: false                 # normalized brand|model|category, for de-duplication
      t.string :status, null: false, default: "open"
      t.text :notes
      t.jsonb :requesters, null: false, default: []   # "user:ID" / "install:UUID", so one person counts once
      t.integer :requests_count, null: false, default: 1
      t.references :user, foreign_key: { on_delete: :nullify }, index: true
      t.timestamps
    end
    add_index :model_requests, :key, unique: true
    add_index :model_requests, %i[status requests_count]
  end
end

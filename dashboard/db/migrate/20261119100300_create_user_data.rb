# Per-user synced data (only used when the user chooses to log in) and feedback.
class CreateUserData < ActiveRecord::Migration[8.0]
  def change
    create_table :rooms do |t|
      t.references :user, null: false, foreign_key: true
      t.string :client_uuid, null: false
      t.string :name, null: false
      t.string :icon
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :rooms, %i[user_id client_uuid], unique: true

    create_table :saved_remotes do |t|
      t.references :user, null: false, foreign_key: true
      t.references :room, foreign_key: { on_delete: :nullify }
      t.references :remote_config, foreign_key: { on_delete: :nullify }
      t.string :client_uuid, null: false
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.jsonb :settings, null: false, default: {} # device ip, hub, last AC state, button overrides
      t.timestamps
    end
    add_index :saved_remotes, %i[user_id client_uuid], unique: true

    create_table :scenes do |t|
      t.references :user, null: false, foreign_key: true
      t.string :client_uuid, null: false
      t.string :name, null: false
      t.string :icon
      t.integer :position, null: false, default: 0
      t.jsonb :steps, null: false, default: [] # [{remote: uuid, command: "POWER", delay_ms: 200}]
      t.timestamps
    end
    add_index :scenes, %i[user_id client_uuid], unique: true

    create_table :config_submissions do |t|
      t.references :user, foreign_key: { on_delete: :nullify } # guests may submit too
      t.string :install_id
      t.string :brand_name, null: false
      t.string :model_name_text, null: false
      t.string :category_slug, null: false
      t.string :protocol, null: false, default: "ir"
      t.jsonb :signal_data, null: false, default: {}
      t.text :notes
      t.string :status, null: false, default: "pending" # pending | approved | rejected
      t.references :reviewed_by, foreign_key: { to_table: :admin_users, on_delete: :nullify }
      t.datetime :reviewed_at
      t.references :remote_config, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :config_submissions, :status

    create_table :match_reports do |t|
      t.references :remote_config, null: false, foreign_key: true
      t.references :user, foreign_key: { on_delete: :nullify }
      t.string :install_id
      t.boolean :worked, null: false
      t.timestamps
    end
  end
end

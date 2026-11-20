# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_11_19_100400) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pg_trgm"
  enable_extension "unaccent"

  create_table "active_admin_comments", force: :cascade do |t|
    t.string "namespace"
    t.text "body"
    t.string "resource_type"
    t.bigint "resource_id"
    t.string "author_type"
    t.bigint "author_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_type", "author_id"], name: "index_active_admin_comments_on_author"
    t.index ["namespace"], name: "index_active_admin_comments_on_namespace"
    t.index ["resource_type", "resource_id"], name: "index_active_admin_comments_on_resource"
  end

  create_table "admin_users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_admin_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_admin_users_on_reset_password_token", unique: true
  end

  create_table "brands", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "website"
    t.integer "remote_models_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "lower((name)::text)", name: "index_brands_on_lower_name"
    t.index ["slug"], name: "index_brands_on_slug", unique: true
  end

  create_table "config_submissions", force: :cascade do |t|
    t.bigint "user_id"
    t.string "install_id"
    t.string "brand_name", null: false
    t.string "model_name_text", null: false
    t.string "category_slug", null: false
    t.string "protocol", default: "ir", null: false
    t.jsonb "signal_data", default: {}, null: false
    t.text "notes"
    t.string "status", default: "pending", null: false
    t.bigint "reviewed_by_id"
    t.datetime "reviewed_at"
    t.bigint "remote_config_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["remote_config_id"], name: "index_config_submissions_on_remote_config_id"
    t.index ["reviewed_by_id"], name: "index_config_submissions_on_reviewed_by_id"
    t.index ["status"], name: "index_config_submissions_on_status"
    t.index ["user_id"], name: "index_config_submissions_on_user_id"
  end

  create_table "device_categories", force: :cascade do |t|
    t.string "slug", null: false
    t.string "name", null: false
    t.string "icon"
    t.integer "position", default: 0, null: false
    t.string "default_layout"
    t.boolean "active", default: true, null: false
    t.integer "remote_models_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_device_categories_on_slug", unique: true
  end

  create_table "match_reports", force: :cascade do |t|
    t.bigint "remote_config_id", null: false
    t.bigint "user_id"
    t.string "install_id"
    t.boolean "worked", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["remote_config_id"], name: "index_match_reports_on_remote_config_id"
    t.index ["user_id"], name: "index_match_reports_on_user_id"
  end

  create_table "model_requests", force: :cascade do |t|
    t.string "brand_name", null: false
    t.string "model_name_text", default: "", null: false
    t.string "category_slug", null: false
    t.string "key", null: false
    t.string "status", default: "open", null: false
    t.text "notes"
    t.jsonb "requesters", default: [], null: false
    t.integer "requests_count", default: 1, null: false
    t.bigint "user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_model_requests_on_key", unique: true
    t.index ["status", "requests_count"], name: "index_model_requests_on_status_and_requests_count"
    t.index ["user_id"], name: "index_model_requests_on_user_id"
  end

  create_table "remote_configs", force: :cascade do |t|
    t.bigint "remote_model_id", null: false
    t.string "protocol", null: false
    t.string "variant", null: false
    t.string "layout_template"
    t.jsonb "signal_data", default: {}, null: false
    t.string "status", default: "draft", null: false
    t.string "source", default: "manual", null: false
    t.string "external_id"
    t.string "checksum"
    t.integer "version", default: 1, null: false
    t.integer "popularity", default: 0, null: false
    t.integer "success_count", default: 0, null: false
    t.integer "failure_count", default: 0, null: false
    t.datetime "published_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["external_id"], name: "index_remote_configs_on_external_id", unique: true
    t.index ["popularity"], name: "index_remote_configs_on_popularity"
    t.index ["remote_model_id"], name: "index_remote_configs_on_remote_model_id"
    t.index ["status", "protocol"], name: "index_remote_configs_on_status_and_protocol"
  end

  create_table "remote_models", force: :cascade do |t|
    t.bigint "brand_id", null: false
    t.bigint "device_category_id", null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.string "source", default: "manual", null: false
    t.integer "remote_configs_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["brand_id", "device_category_id", "slug"], name: "index_remote_models_unique_per_brand_category", unique: true
    t.index ["brand_id"], name: "index_remote_models_on_brand_id"
    t.index ["device_category_id"], name: "index_remote_models_on_device_category_id"
  end

  create_table "rooms", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "client_uuid", null: false
    t.string "name", null: false
    t.string "icon"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "client_uuid"], name: "index_rooms_on_user_id_and_client_uuid", unique: true
    t.index ["user_id"], name: "index_rooms_on_user_id"
  end

  create_table "saved_remotes", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "room_id"
    t.bigint "remote_config_id"
    t.string "client_uuid", null: false
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.jsonb "settings", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["remote_config_id"], name: "index_saved_remotes_on_remote_config_id"
    t.index ["room_id"], name: "index_saved_remotes_on_room_id"
    t.index ["user_id", "client_uuid"], name: "index_saved_remotes_on_user_id_and_client_uuid", unique: true
    t.index ["user_id"], name: "index_saved_remotes_on_user_id"
  end

  create_table "scenes", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "client_uuid", null: false
    t.string "name", null: false
    t.string "icon"
    t.integer "position", default: 0, null: false
    t.jsonb "steps", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "client_uuid"], name: "index_scenes_on_user_id_and_client_uuid", unique: true
    t.index ["user_id"], name: "index_scenes_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "name"
    t.string "locale"
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.string "jti", null: false
    t.datetime "last_seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "config_submissions", "admin_users", column: "reviewed_by_id", on_delete: :nullify
  add_foreign_key "config_submissions", "remote_configs", on_delete: :nullify
  add_foreign_key "config_submissions", "users", on_delete: :nullify
  add_foreign_key "match_reports", "remote_configs"
  add_foreign_key "match_reports", "users", on_delete: :nullify
  add_foreign_key "model_requests", "users", on_delete: :nullify
  add_foreign_key "remote_configs", "remote_models"
  add_foreign_key "remote_models", "brands"
  add_foreign_key "remote_models", "device_categories"
  add_foreign_key "rooms", "users"
  add_foreign_key "saved_remotes", "remote_configs", on_delete: :nullify
  add_foreign_key "saved_remotes", "rooms", on_delete: :nullify
  add_foreign_key "saved_remotes", "users"
  add_foreign_key "scenes", "users"
end

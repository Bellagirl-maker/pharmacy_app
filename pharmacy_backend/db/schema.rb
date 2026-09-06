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

ActiveRecord::Schema[8.0].define(version: 2026_09_02_232945) do
  

  # These are extensions that must be enabled in order to support this database
  enable_extension "extensions.pg_stat_statements"
  enable_extension "extensions.pgcrypto"
  enable_extension "extensions.uuid-ossp"
  enable_extension "pg_catalog.plpgsql"
  enable_extension "vault.supabase_vault"

  create_table "audit_logs", force: :cascade do |t|
    t.bigint "manager_id", null: false
    t.string "action_type"
    t.string "trackable_type"
    t.integer "trackable_id"
    t.text "details"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["manager_id"], name: "index_audit_logs_on_manager_id"
    t.index ["trackable_type", "trackable_id"], name: "index_audit_logs_on_trackable_type_and_trackable_id"
  end

  create_table "batches", force: :cascade do |t|
    t.bigint "medicine_id", null: false
    t.string "batch_number"
    t.integer "quantity"
    t.date "expiry_date"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["medicine_id"], name: "index_batches_on_medicine_id"
  end

  create_table "managers", force: :cascade do |t|
    t.string "username"
    t.string "password_digest"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "role"
    t.boolean "must_change_password"
  end

  create_table "medicine_units", force: :cascade do |t|
    t.bigint "medicine_id", null: false
    t.string "unit_name", null: false
    t.decimal "price", precision: 10, scale: 2, null: false
    t.integer "quantity_in_base_units", default: 1, null: false
    t.boolean "is_default", default: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["medicine_id", "unit_name"], name: "index_medicine_units_on_medicine_id_and_unit_name", unique: true
    t.index ["medicine_id"], name: "index_medicine_units_on_medicine_id"
  end

  create_table "medicines", force: :cascade do |t|
    t.string "name"
    t.decimal "price", precision: 10, scale: 2
    t.integer "stock_quantity"
    t.string "shelf_location"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "unit", default: "tablet"
  end

  create_table "order_items", force: :cascade do |t|
    t.bigint "order_id", null: false
    t.bigint "medicine_id", null: false
    t.integer "quantity"
    t.decimal "price_at_sale", precision: 10, scale: 2
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["medicine_id"], name: "index_order_items_on_medicine_id"
    t.index ["order_id"], name: "index_order_items_on_order_id"
  end

  create_table "orders", force: :cascade do |t|
    t.decimal "total_amount", precision: 10, scale: 2
    t.string "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "manager_id", null: false
    t.index ["manager_id"], name: "index_orders_on_manager_id"
  end

  add_foreign_key "audit_logs", "managers"
  add_foreign_key "batches", "medicines"
  add_foreign_key "medicine_units", "medicines"
  add_foreign_key "order_items", "medicines"
  add_foreign_key "order_items", "orders"
  add_foreign_key "orders", "managers"
end

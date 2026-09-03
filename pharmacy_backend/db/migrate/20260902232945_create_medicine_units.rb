class CreateMedicineUnits < ActiveRecord::Migration[8.0]
  def change
    create_table :medicine_units do |t|
      t.references :medicine, null: false, foreign_key: true
      t.string :unit_name, null: false
      t.decimal :price, precision: 10, scale: 2, null: false
      t.integer :quantity_in_base_units, null: false, default: 1
      t.boolean :is_default, default: false
      t.timestamps
    end

    add_index :medicine_units, [:medicine_id, :unit_name], unique: true
  end
end
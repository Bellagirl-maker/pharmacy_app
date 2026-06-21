class CreateMedicines < ActiveRecord::Migration[8.0]
  def change
    create_table :medicines do |t|
      t.string :name
      t.decimal :price, precision: 10, scale: 2
      t.integer :stock_quantity
      t.string :shelf_location

      t.timestamps
    end
  end
end

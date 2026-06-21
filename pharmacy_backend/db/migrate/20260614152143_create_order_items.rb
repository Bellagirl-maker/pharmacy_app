class CreateOrderItems < ActiveRecord::Migration[8.0]
  def change
    create_table :order_items do |t|
      t.references :order, null: false, foreign_key: true
      t.references :medicine, null: false, foreign_key: true
      t.integer :quantity
      t.decimal :price_at_sale, precision: 10, scale: 2

      t.timestamps
    end
  end
end

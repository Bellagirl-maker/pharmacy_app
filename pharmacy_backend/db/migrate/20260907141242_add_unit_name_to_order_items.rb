class AddUnitNameToOrderItems < ActiveRecord::Migration[8.0]
  def change
    add_column :order_items, :unit_name, :string
  end
end

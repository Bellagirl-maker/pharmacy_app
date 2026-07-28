class AddManagerToOrders < ActiveRecord::Migration[8.0]
  def change
    # 1. Temporarily add the column allowing null values so old records don't crash the migration
    add_reference :orders, :manager, null: true, foreign_key: true

    # 2. Assign all existing orders to your first manager account so they have an owner
    reversible do |dir|
      dir.up do
        first_manager = Manager.first
        if first_manager
          execute "UPDATE orders SET manager_id = #{first_manager.id} WHERE manager_id IS NULL"
        end
      end
    end

    # 3. Safely lock down the column to prevent future null entries
    change_column_null :orders, :manager_id, false
  end
end
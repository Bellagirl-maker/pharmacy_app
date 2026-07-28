class AddRoleToManagers < ActiveRecord::Migration[8.0]
  def change
    add_column :managers, :role, :string
  end
end

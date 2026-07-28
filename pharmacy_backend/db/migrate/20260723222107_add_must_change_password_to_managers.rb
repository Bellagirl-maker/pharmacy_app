class AddMustChangePasswordToManagers < ActiveRecord::Migration[8.0]
  def change
    add_column :managers, :must_change_password, :boolean
  end
end

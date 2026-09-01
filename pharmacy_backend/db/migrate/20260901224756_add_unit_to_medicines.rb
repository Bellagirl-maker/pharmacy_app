class AddUnitToMedicines < ActiveRecord::Migration[8.0]
  def change
    add_column :medicines, :unit, :string, default: 'tablet'
  end
end

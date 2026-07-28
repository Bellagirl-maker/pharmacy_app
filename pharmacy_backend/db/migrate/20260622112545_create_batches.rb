class CreateBatches < ActiveRecord::Migration[8.0]
  def change
    create_table :batches do |t|
      t.references :medicine, null: false, foreign_key: true
      t.string :batch_number
      t.integer :quantity
      t.date :expiry_date

      t.timestamps
    end
  end
end

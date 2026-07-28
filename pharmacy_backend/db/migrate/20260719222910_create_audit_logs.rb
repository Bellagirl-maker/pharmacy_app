class CreateAuditLogs < ActiveRecord::Migration[8.0]
  def change
    create_table :audit_logs do |t|
      t.references :manager, null: false, foreign_key: true
      t.string :action_type
      t.string :trackable_type
      t.integer :trackable_id
      t.text :details

      t.timestamps
    end
    add_index :audit_logs, [:trackable_type, :trackable_id]
  end
end

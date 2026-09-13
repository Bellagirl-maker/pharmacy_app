class AddAuthTokenDigestToManagers < ActiveRecord::Migration[8.0]
  def change
    add_column :managers, :auth_token_digest, :string
    add_index :managers, :auth_token_digest, unique: true
  end
end

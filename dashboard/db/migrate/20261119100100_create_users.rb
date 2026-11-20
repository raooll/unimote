# End-user accounts. Login is OPTIONAL in the app: everything works as a guest,
# an account only enables cloud sync of rooms / remotes / scenes.
class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :encrypted_password, null: false, default: ""
      t.string :name
      t.string :locale
      t.string :reset_password_token
      t.datetime :reset_password_sent_at
      t.datetime :remember_created_at
      t.string :jti, null: false # JWT revocation (devise-jwt JTIMatcher)
      t.datetime :last_seen_at
      t.timestamps
    end
    add_index :users, :email, unique: true
    add_index :users, :reset_password_token, unique: true
    add_index :users, :jti, unique: true
  end
end

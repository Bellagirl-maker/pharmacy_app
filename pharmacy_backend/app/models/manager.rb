class Manager < ApplicationRecord
  has_secure_password
  
  has_many :orders
  has_many :audit_logs
  
  validates :username, presence: true, uniqueness: { case_sensitive: false }
  validates :role, presence: true, inclusion: { in: %w[counter cashier inventory owner] }

  # Automatically flag all newly provisioned accounts to force a password change
  before_validation :set_default_password_flag, on: :create

  private

  def set_default_password_flag
    self.must_change_password = true if self.must_change_password.nil?
  end
end
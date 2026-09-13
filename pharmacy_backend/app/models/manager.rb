class Manager < ApplicationRecord
  has_secure_password
  
  has_many :orders
  has_many :audit_logs
  
  validates :username, presence: true, uniqueness: { case_sensitive: false }
  validates :role, presence: true, inclusion: { in: %w[counter cashier inventory owner] }

  # Automatically flag all newly provisioned accounts to force a password change
  before_validation :set_default_password_flag, on: :create

  # Issues a new opaque bearer token for this manager, invalidating any
  # previous one, and returns the RAW token (only ever available here,
  # right after issuance - only its digest is persisted).
  def issue_auth_token!
    raw_token = SecureRandom.hex(32)
    update_column(:auth_token_digest, self.class.digest_token(raw_token))
    raw_token
  end

  # Invalidates whatever token this manager currently holds, e.g. on
  # logout, forced password reset, or account removal - forces re-login.
  def revoke_auth_token!
    update_column(:auth_token_digest, nil)
  end

  def self.digest_token(raw_token)
    Digest::SHA256.hexdigest(raw_token)
  end

  # Looks up a manager from a raw bearer token presented on a request.
  # Never trust the token's claimed identity directly - always resolve it
  # server-side against the stored digest.
  def self.find_by_auth_token(raw_token)
    return nil if raw_token.blank?
    find_by(auth_token_digest: digest_token(raw_token))
  end

  private

  def set_default_password_flag
    self.must_change_password = true if self.must_change_password.nil?
  end
end
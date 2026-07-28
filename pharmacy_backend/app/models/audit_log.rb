class AuditLog < ApplicationRecord
  belongs_to :manager
  belongs_to :trackable, polymorphic: true, optional: true

  validates :action_type, presence: true
end
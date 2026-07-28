class Order < ApplicationRecord
  # Add these two lines to connect the tables:
  has_many :order_items, dependent: :destroy
  has_many :medicines, through: :order_items

  belongs_to :manager # The employee responsible for this state change
  has_many :audit_logs, as: :trackable

  validates :status, inclusion: { in: %w[pending paid dispensed cancelled] }
  
  before_validation :set_defaults, on: :create

  private

  def set_defaults
    self.status ||= 'pending'
    self.total_amount ||= 0.00
  end
end
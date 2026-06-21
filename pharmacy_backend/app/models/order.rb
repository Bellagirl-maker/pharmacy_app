class Order < ApplicationRecord
  # Add these two lines to connect the tables:
  has_many :order_items, dependent: :destroy
  has_many :medicines, through: :order_items

  # Limit status strictly to our 3 pharmacy steps
  validates :status, inclusion: { in: %w[pending paid dispensed] }
  
  before_validation :set_defaults, on: :create

  private

  def set_defaults
    self.status ||= 'pending'
    self.total_amount ||= 0.00
  end
end
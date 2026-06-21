class OrderItem < ApplicationRecord
  belongs_to :order
  belongs_to :medicine

  validates :quantity, presence: true, numericality: { greater_than: 0 }
  validates :price_at_sale, presence: true
end
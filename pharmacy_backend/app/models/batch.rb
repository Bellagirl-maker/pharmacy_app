class Batch < ApplicationRecord
  belongs_to :medicine

  validates :batch_number, presence: true
  validates :quantity, numericality: { greater_than_or_equal_to: 0 }
  validates :expiry_date, presence: true
end
class MedicineUnit < ApplicationRecord
  belongs_to :medicine

  validates :unit_name, presence: true
  validates :price, presence: true, numericality: { greater_than: 0 }
  validates :quantity_in_base_units, presence: true, numericality: { greater_than: 0 }
  validates :unit_name, uniqueness: { scope: :medicine_id, message: "already exists for this medicine" }
end

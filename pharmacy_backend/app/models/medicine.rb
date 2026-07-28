class Medicine < ApplicationRecord
  has_many :batches, dependent: :destroy
  has_many :order_items

  # Scope to calculate total live stock across all batches dynamically
  def total_stock
    batches.where('expiry_date > ?', Date.today).sum(:quantity)
  end

  # Scope to find batches expiring within the next 90 days (3 months)
  def self.expiring_soon
    Batch.where(expiry_date: Date.today..(Date.today + 90.days))
  end

  # Scope to find batches that are already past their expiration date but still in the database
  def self.expired_on_shelf
    Batch.where('expiry_date <= ?', Date.today)
  end
end
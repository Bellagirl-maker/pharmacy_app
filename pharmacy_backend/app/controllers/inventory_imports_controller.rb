require 'csv'

class InventoryImportsController < ApplicationController
  def create
    unless params[:file].present?
      render json: { error: "No file was uploaded." }, status: :unprocessable_entity
      return
    end

    file = params[:file]
    imported_count = 0

    begin
      ActiveRecord::Base.transaction do
        CSV.foreach(file.path, headers: true) do |row|
          # Expected columns in CSV: medicine_name, batch_number, quantity, expiry_date
          med_name   = row['medicine_name']&.strip
          batch_num  = row['batch_number']&.strip
          qty        = row['quantity'].to_i
          expiry     = row['expiry_date']&.strip

          next if med_name.blank? || batch_num.blank?

          # Find or create the master product record
          medicine = Medicine.find_or_create_by!(name: med_name)

          # Add or update the specific shelf batch lot
          batch = medicine.batches.find_or_initialize_by(batch_number: batch_num)
          batch.quantity = qty
          batch.expiry_date = Date.parse(expiry)
          batch.save!

          imported_count += 1
        end
      end

      render json: { success: true, message: "Successfully imported #{imported_count} record chains." }, status: :ok
    rescue Date::Error => e
      render json: { error: "Date formatting issue inside CSV file. Please use YYYY-MM-DD format." }, status: :bad_request
    rescue => e
      render json: { error: "CSV Parsing failed: #{e.message}" }, status: :bad_request
    end
  end
end
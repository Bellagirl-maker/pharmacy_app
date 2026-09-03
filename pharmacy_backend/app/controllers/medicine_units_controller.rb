class MedicineUnitsController < ApplicationController
  before_action :authorize_request

  # POST /medicines/:medicine_id/units
  def create
    medicine = Medicine.find(params[:medicine_id])
    unit = medicine.medicine_units.new(unit_params)
    if unit.save
      render json: unit, status: :created
    else
      render json: { error: unit.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # PATCH /medicines/:medicine_id/units/:id
  def update
    unit = MedicineUnit.find(params[:id])
    if unit.update(unit_params)
      render json: unit
    else
      render json: { error: unit.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # DELETE /medicines/:medicine_id/units/:id
  def destroy
    unit = MedicineUnit.find(params[:id])
    if unit.is_default
      render json: { error: "Cannot delete the default unit." }, status: :unprocessable_entity
      return
    end
    unit.destroy
    render json: { success: true }
  end

  private

  def unit_params
    params.require(:medicine_unit).permit(:unit_name, :price, :quantity_in_base_units, :is_default)
  end
end

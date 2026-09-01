class MedicinesController < ApplicationController
  before_action :authorize_request, only: [:create, :update, :destroy, :update_stock]

  # GET /medicines
  # GET /medicines?search=Vit
  def index
    if params[:search].present?
      @medicines = Medicine.includes(:batches).where("LOWER(name) LIKE ?", "%#{params[:search].downcase}%")
    else
      @medicines = Medicine.includes(:batches).all
    end
    render json: @medicines.to_json(include: {
      batches: { only: [:id, :batch_number, :quantity, :expiry_date] }
    })
  end

  # POST /medicines
  def create
    @medicine = Medicine.new(medicine_params)
    if @medicine.save
      AuditLog.create!(
        manager: current_manager,
        action_type: "MEDICINE_ADDED",
        trackable: @medicine
      )
      render json: @medicine.to_json(include: {
        batches: { only: [:id, :batch_number, :quantity, :expiry_date] }
      }), status: :created
    else
      render json: { error: @medicine.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # PATCH /medicines/:id
  def update
    @medicine = Medicine.find(params[:id])
    if @medicine.update(medicine_params)
      AuditLog.create!(
        manager: current_manager,
        action_type: "MEDICINE_UPDATED",
        trackable: @medicine
      )
      render json: @medicine.to_json(include: {
        batches: { only: [:id, :batch_number, :quantity, :expiry_date] }
      })
    else
      render json: { error: @medicine.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # DELETE /medicines/:id
  def destroy
    @medicine = Medicine.find(params[:id])
    @medicine.batches.destroy_all if @medicine.respond_to?(:batches)
    if @medicine.destroy
      render json: { success: true, message: "Medicine removed successfully" }, status: :ok
    else
      render json: { error: "Failed to delete medicine" }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Medicine not found" }, status: :not_found
  end

  # PATCH /medicines/:id/update_stock
  def update_stock
    @medicine = Medicine.find(params[:id])
    old_stock = @medicine.stock_level || 0
    if @medicine.update(medicine_stock_params)
      AuditLog.create!(
        manager: current_manager,
        action_type: "STOCK_ADJUSTMENT",
        trackable: @medicine,
        details: "Adjusted stock level of #{@medicine.name} from #{old_stock} to #{@medicine.stock_level} units."
      )
      render json: { success: true, medicine: @medicine }
    else
      render json: { success: false, errors: @medicine.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def medicine_params
    params.require(:medicine).permit(:name, :price, :unit, :shelf_location)
  end

  def medicine_stock_params
    params.require(:medicine).permit(:stock_level)
  end
end
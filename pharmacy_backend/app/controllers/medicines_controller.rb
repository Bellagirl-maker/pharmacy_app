class MedicinesController < ApplicationController
  # 🎯 Enforce authentication before anyone alters inventory counts
  before_action :authorize_request, only: [:update_stock]

  # GET /medicines
  # GET /medicines?search=Vit
  def index
    if params[:search].present?
      # Case-insensitive SQL search matching any part of the name with eager loading
      @medicines = Medicine.includes(:batches).where("LOWER(name) LIKE ?", "%#{params[:search].downcase}%")
    else
      @medicines = Medicine.includes(:batches).all
    end

    # Render JSON including the associated nested batches relation
    render json: @medicines.to_json(include: { 
      batches: { only: [:id, :batch_number, :quantity, :expiry_date] } 
    })
  end

  # 🎯 NEW ACTION: Updates stock levels and leaves a permanent audit footprint
  def update_stock
    @medicine = Medicine.find(params[:id])
    
    # Capture the old stock value from the database before applying updates
    old_stock = @medicine.stock_level || 0 

    if @medicine.update(medicine_stock_params)
      # Create the permanent log tracking the action back to the active user session
      AuditLog.create!(
        manager_id: current_manager.id, 
        action_type: "STOCK_ADJUSTMENT",
        trackable: @medicine,
        details: "Adjusted stock level of #{@medicine.name} from #{old_stock} to #{@medicine.stock_level} units."
      )
      
      render json: { success: true, medicine: @medicine }
    else
      render json: { success: false, errors: @medicine.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /medicines/:id
  def destroy
    @medicine = Medicine.find(params[:id])
    
    # Delete associated batches automatically if dependent: :destroy isn't on the model
    @medicine.batches.destroy_all if @medicine.respond_to?(:batches)

    if @medicine.destroy
      render json: { success: true, message: "Medicine removed successfully" }, status: :ok
    else
      render json: { error: "Failed to delete medicine" }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Medicine not found" }, status: :not_found
  end

  private

  def medicine_stock_params
    # Adapt to the layout of your incoming React payload (e.g. stock_level or quantity)
    params.require(:medicine).permit(:stock_level)
  end
end
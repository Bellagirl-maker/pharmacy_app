class MedicinesController < ApplicationController
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
      batches: { only: [:batch_number, :quantity, :expiry_date] } 
    })
  end
end
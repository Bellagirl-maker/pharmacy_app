class MedicinesController < ApplicationController
  # GET /medicines?search=Vit
  def index
    if params[:search].present?
      # Case-insensitive SQL search matching any part of the name
      @medicines = Medicine.where("LOWER(name) LIKE ?", "%#{params[:search].downcase}%")
    else
      @medicines = Medicine.all
    end

    render json: @medicines
  end
end
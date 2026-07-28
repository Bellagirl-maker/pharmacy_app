class BatchesController < ApplicationController
  before_action :set_batch, only: [:destroy]

  # DELETE /batches/:id
  def destroy
    if @batch.destroy
      render json: { success: true, message: "Batch removed successfully" }, status: :ok
    else
      render json: { error: "Failed to delete batch" }, status: :unprocessable_entity
    end
  end

  private

  def set_batch
    # Adjust to Batch.find or InventoryBatch.find depending on your model class name
    @batch = Batch.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Batch not found" }, status: :not_found
  end
end
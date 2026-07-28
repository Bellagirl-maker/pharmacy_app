class AuditLogsController < ApplicationController
  # Ensure the request contains valid session cookies
  before_action :authorize_request
  
  def index
    # Restrict viewing privileges to owner/admin accounts
    if current_manager.role == 'owner' || current_manager.role == 'admin'
      # Eager load the manager association to keep it performant
      @logs = AuditLog.includes(:manager).order(created_at: :desc).limit(100)
      
      render json: @logs.as_json(include: { manager: { only: [:username, :role] } }), status: :ok
    else
      render json: { error: "Access denied. Administrative permissions required." }, status: :forbidden
    end
  end
end
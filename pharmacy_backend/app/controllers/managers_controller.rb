# app/controllers/managers_controller.rb
class ManagersController < ApplicationController
  before_action :authorize_request
  before_action :require_owner, only: [:index, :create, :update, :destroy]

  # 1. GET /managers - Fetch all staff members (so the owner can see the roster)
  def index
    # Return all managers, sorting owners to the top, excluding passwords from the JSON payload
    managers = Manager.order(role: :asc, username: :asc)
    render json: managers.as_json(only: [:id, :username, :role, :created_at])
  end

  # 2. POST /managers - Owner creates a new individual staff account
  def create
    manager = Manager.new(manager_params)
    if manager.save
      render json: { success: true, message: "Account for #{manager.username} successfully provisioned!" }, status: :created
    else
      render json: { error: manager.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # 3. PATCH/PUT /managers/:id - Owner manually updates or overrides an employee (e.g., Reset Password)
  def update
    staff = Manager.find(params[:id])
    if staff.update(manager_params)
      render json: { success: true, message: "Staff account updated successfully." }
    else
      render json: { error: staff.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # 4. DELETE /managers/:id - Owner deprovisions/fires a staff account
  def destroy
    staff = Manager.find(params[:id])
    if staff == current_user
      render json: { error: "You cannot delete your own administrative owner account!" }, status: :bad_request
    elsif staff.destroy
      render json: { success: true, message: "Staff account removed from database." }
    else
      render json: { error: "Failed to delete account." }, status: :unprocessable_entity
    end
  end

  # 5. PATCH /profile/change_password - Self-service endpoint (Any logged-in user changing their own password)
  def change_password
    if current_user.authenticate(params[:current_password])
      if current_user.update(password: params[:new_password])
        render json: { success: true, message: "Your password has been updated securely!" }
      else
        render json: { error: current_user.errors.full_messages.join(', ') }, status: :unprocessable_entity
      end
    else
      render json: { error: "Current password validation failed. Verification denied." }, status: :unauthorized
    end
  end

  private

  def manager_params
    params.require(:manager).permit(:username, :password, :role)
  end

  def require_owner
    unless current_user&.role == 'owner'
      render json: { error: "Access denied. Administrative authority required." }, status: :forbidden
    end
  end
end
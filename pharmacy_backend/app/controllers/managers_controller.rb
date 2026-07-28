# app/controllers/managers_controller.rb
class ManagersController < ApplicationController
  before_action :authorize_request
  before_action :require_owner, only: [:index, :create, :update, :destroy, :reset_password]

  # 1. GET /managers - Fetch all staff members (includes flag for frontend checks)
  def index
    managers = Manager.order(role: :asc, username: :asc)
    render json: managers.as_json(only: [:id, :username, :role, :must_change_password, :created_at])
  end

  # 2. POST /managers - Owner creates a new staff account
  def create
    manager = Manager.new(manager_params)
    if manager.save
      render json: { success: true, message: "Account for #{manager.username} successfully provisioned!" }, status: :created
    else
      render json: { error: manager.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # 3. PATCH/PUT /managers/:id - Owner updates an employee
  def update
    staff = Manager.find(params[:id])
    if staff.update(manager_params)
      render json: { success: true, message: "Staff account updated successfully." }
    else
      render json: { error: staff.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  # 4. DELETE /managers/:id - Owner deprovisions a staff account
  def destroy
    staff = Manager.find(params[:id])
    if staff == current_manager
      render json: { error: "You cannot delete your own administrative owner account!" }, status: :bad_request
    elsif staff.destroy
      render json: { success: true, message: "Staff account removed from database." }
    else
      render json: { error: "Failed to delete account." }, status: :unprocessable_entity
    end
  end

  # 5. PATCH /profile/change_password - Self-service password update (Clears forced flag)
  def change_password
    if current_manager.authenticate(params[:current_password])
      if current_manager.update(password: params[:new_password], must_change_password: false)
        render json: { success: true, message: "Your password has been updated securely!" }
      else
        render json: { error: current_manager.errors.full_messages.join(', ') }, status: :unprocessable_entity
      end
    else
      render json: { error: "Current password validation failed. Verification denied." }, status: :unauthorized
    end
  end

  # 6. POST /managers/:id/reset_password - Owner resets an employee's password
  def reset_password
    staff = Manager.find(params[:id])
    temp_password = params[:temp_password] || "ChangeMe123!"

    if staff.update(password: temp_password, must_change_password: true)
      render json: { success: true, message: "Password reset for #{staff.username}. Forced change flag active." }
    else
      render json: { error: staff.errors.full_messages.join(', ') }, status: :unprocessable_entity
    end
  end

  private

  def manager_params
    params.require(:manager).permit(:username, :password, :role)
  end

  def require_owner
    unless current_manager&.role == 'owner'
      render json: { error: "Access denied. Administrative authority required." }, status: :forbidden
    end
  end
end
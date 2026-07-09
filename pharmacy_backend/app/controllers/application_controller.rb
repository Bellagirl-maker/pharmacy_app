# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  def current_user
    # For initial testing, we read the username directly from an custom incoming request header.
    # In a fully deployed production environment, you would decode a secure JWT token here.
    @current_user ||= Manager.find_by(username: request.headers['X-Manager-Username'])
  end

  def authorize_request
    unless current_user
      render json: { error: "Authentication credentials required" }, status: :unauthorized
    end
  end
end
# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  # Include this module so API mode can read cookies and sessions
  include ActionController::Cookies

  def current_manager
    # Read from the encrypted Rails session cookie
    @current_manager ||= Manager.find_by(id: session[:manager_id]) if session[:manager_id]
  end

  def logged_in?
    !!current_manager
  end

  def authorize_request
    # Block requests if current_manager comes back nil
    unless current_manager
      render json: { error: "Authentication credentials required" }, status: :unauthorized
    end
  end
end
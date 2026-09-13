# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  # Include this module so API mode can read cookies and sessions
  include ActionController::Cookies

  def current_manager
    # SECURITY: identity comes only from a server-issued, unguessable bearer
    # token that is resolved via Manager.find_by_auth_token (which hashes
    # the presented token and looks up the match server-side). A request
    # can never simply *claim* to be a given manager id/username - it has
    # to present the secret token that was issued to that manager at login.
    @current_manager ||= Manager.find_by_auth_token(bearer_token)
  end

  def bearer_token
    header = request.headers['Authorization']
    header&.start_with?('Bearer ') ? header.sub('Bearer ', '') : nil
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
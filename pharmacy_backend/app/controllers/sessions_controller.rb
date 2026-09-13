class SessionsController < ApplicationController
  # 💡 The 'raise: false' flag prevents Rails from crashing if CSRF modules are disabled!
  skip_before_action :verify_authenticity_token, raise: false

  def create
    # Downcase and trim to avoid formatting mismatches
    username_input = params[:username].to_s.downcase.strip
    manager = Manager.find_by(username: username_input)

    if manager&.authenticate(params[:password])
      # Issue a fresh unguessable bearer token for this login. Only its
      # digest is stored server-side; the raw value is returned once here
      # and the frontend must send it back as "Authorization: Bearer <token>"
      # on every subsequent request. This avoids depending on cross-site
      # session cookies, which browsers may block between the frontend and
      # backend subdomains.
      token = manager.issue_auth_token!

      render json: {
        success: true,
        token: token,
        id: manager.id,
        username: manager.username,
        role: manager.role
      }, status: :ok
    else
      render json: { error: "Invalid management username or password" }, status: :unauthorized
    end
  end

  # Logging out invalidates the token server-side so it can't be reused
  # even if it lingers in the browser somehow.
  def destroy
    current_manager&.revoke_auth_token!
    render json: { success: true, message: "Logged out cleanly." }, status: :ok
  end
end
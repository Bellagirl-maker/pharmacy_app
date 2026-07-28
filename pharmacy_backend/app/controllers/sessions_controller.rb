class SessionsController < ApplicationController
  # 💡 The 'raise: false' flag prevents Rails from crashing if CSRF modules are disabled!
  skip_before_action :verify_authenticity_token, raise: false

  def create
    # Downcase and trim to avoid formatting mismatches
    username_input = params[:username].to_s.downcase.strip
    manager = Manager.find_by(username: username_input)

    if manager&.authenticate(params[:password])
      # 🎯 STEP 1: Store the logged-in user's ID inside the encrypted Rails cookie session
      session[:manager_id] = manager.id 

      # 🎯 STEP 2: Pass the properties out to React so the ProtectedGate components unlock!
      render json: { 
        success: true, 
        username: manager.username,
        role: manager.role 
      }, status: :ok
    else
      render json: { error: "Invalid management username or password" }, status: :unauthorized
    end
  end

  # 🎯 STEP 3: Add a destroy method so the logout button clears the session footprint!
  def destroy
    session[:manager_id] = nil
    render json: { success: true, message: "Logged out cleanly." }, status: :ok
  end
end
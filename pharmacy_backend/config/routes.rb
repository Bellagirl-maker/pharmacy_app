Rails.application.routes.draw do
  get "audit_logs/index"
  
  # Updated to include :destroy for deleting full medicine records
  resources :medicines, only: [:index, :create, :update, :destroy] do
  member do
    patch :update_stock
  end
end
  
  # Add this line for batch deletion support:
  resources :batches, only: [:destroy]

  # Updated orders routing matrix to support ticket cancellation
  resources :orders, only: [:create, :update, :index] do
    member do
      patch :cancel
    end
  end

  get 'owner/dashboard', to: 'owner#dashboard'

  post 'login', to: 'sessions#create'
  post "/inventory/import", to: "inventory_imports#create"

  # Manager management routing matrix
  resources :managers, only: [:index, :create, :update, :destroy] do
    member do
      post :reset_password
    end
  end

  resources :audit_logs, only: [:index]
  
  # Self-service password change route for logged-in users
  patch "/profile/change_password", to: "managers#change_password"

  mount ActionCable.server => '/cable'
end
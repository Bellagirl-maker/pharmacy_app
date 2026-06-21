Rails.application.routes.draw do
  get "orders/create"
  resources :medicines, only: [:index]
  resources :orders, only: [:create, :update]

  mount ActionCable.server => '/cable'
end
Rails.application.routes.draw do
  devise_for :admin_users, ActiveAdmin::Devise.config
  ActiveAdmin.routes(self)

  # Background job dashboard (inside the admin's Devise auth)
  authenticate :admin_user do
    mount MissionControl::Jobs::Engine, at: "/admin/jobs"
  end

  # API documentation (Swagger UI): /api-docs
  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

  # Devise mapping for end users (JWT, no HTML routes) — see Api::V1::AuthController
  devise_for :users, skip: :all

  # JSON API for the mobile apps. Public unless noted; login is optional.
  namespace :api do
    namespace :v1 do
      resource :health, only: :show, controller: "health"

      # Catalog (public)
      get "layouts", to: "layouts#index"
      resources :categories, only: :index
      resources :brands, only: :index
      resources :models, only: :index
      resources :remotes, only: :show do
        collection { get :match }
        resources :reports, only: :create
      end
      resources :submissions, only: :create
      resources :model_requests, only: :create

      # Optional account
      scope :auth, controller: :auth do
        post "sign_up", action: :sign_up
        post "sign_in", action: :sign_in
        delete "sign_out", action: :sign_out
        post "password", action: :password_reset
        put "password", action: :password_update
      end
      resource :me, controller: :me, only: %i[show update destroy]

      # Synced user data (requires login)
      resources :rooms, only: :index
      put "rooms/:client_uuid", to: "rooms#update"
      delete "rooms/:client_uuid", to: "rooms#destroy"
      resources :saved_remotes, only: :index
      put "saved_remotes/:client_uuid", to: "saved_remotes#update"
      delete "saved_remotes/:client_uuid", to: "saved_remotes#destroy"
      resources :scenes, only: :index
      put "scenes/:client_uuid", to: "scenes#update"
      delete "scenes/:client_uuid", to: "scenes#destroy"
      resource :sync, controller: :sync, only: %i[show create]
    end
  end

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end

module Api
  # Login is OPTIONAL. Endpoints are public unless they call `authenticate_user!`.
  # `current_user` is nil for guests; it never raises.
  module Authentication
    extend ActiveSupport::Concern

    def current_user
      return @current_user if defined?(@current_user)

      @current_user = request.env["warden"]&.authenticate(:jwt, scope: :user, store: false)
      @current_user&.touch_last_seen!
      @current_user
    end

    def authenticate_user!
      render_error(:unauthorized, "unauthorized", "Please sign in to use this feature") unless current_user
    end

    def issue_token(user)
      Warden::JWTAuth::UserEncoder.new.call(user, :user, nil).first
    end
  end
end

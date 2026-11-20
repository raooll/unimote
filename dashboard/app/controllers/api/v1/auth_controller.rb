module Api
  module V1
    # Optional accounts. Every other endpoint also works without signing in.
    class AuthController < Api::BaseController
      before_action :authenticate_user!, only: :sign_out

      # POST /api/v1/auth/sign_up  { user: { email, password, name } }
      def sign_up
        user = User.create!(params.require(:user).permit(:email, :password, :name, :locale))
        render json: { user: Api::Resources::User.new(user).to_h, token: issue_token(user) }, status: :created
      end

      # POST /api/v1/auth/sign_in  { user: { email, password } }
      def sign_in
        creds = params.require(:user)
        user = User.find_for_database_authentication(email: creds[:email].to_s.strip.downcase)
        if user&.valid_password?(creds[:password].to_s)
          render json: { user: Api::Resources::User.new(user).to_h, token: issue_token(user) }
        else
          render_error(:unauthorized, "invalid_credentials", "Invalid email or password")
        end
      end

      # DELETE /api/v1/auth/sign_out — revokes ALL tokens of the user (JTI rotation).
      def sign_out
        current_user.update_column(:jti, SecureRandom.uuid)
        head :no_content
      end

      # POST /api/v1/auth/password  { email } — always 202 so emails can't be enumerated.
      def password_reset
        User.send_reset_password_instructions(email: params.require(:email).to_s.strip.downcase)
        head :accepted
      end

      # PUT /api/v1/auth/password  { reset_password_token, password }
      def password_update
        user = User.reset_password_by_token(
          reset_password_token: params.require(:reset_password_token), password: params.require(:password),
          password_confirmation: params[:password_confirmation].presence || params[:password]
        )
        if user.errors.empty?
          user.update_column(:jti, SecureRandom.uuid) # sign out everywhere
          render json: { user: Api::Resources::User.new(user).to_h, token: issue_token(user) }
        else
          render_error(:unprocessable_content, "invalid", user.errors.full_messages.to_sentence, user.errors.to_hash)
        end
      end
    end
  end
end

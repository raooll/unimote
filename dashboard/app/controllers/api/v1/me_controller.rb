module Api
  module V1
    class MeController < Api::BaseController
      before_action :authenticate_user!

      def show = render(json: { user: Api::Resources::User.new(current_user).to_h })

      def update
        current_user.update!(params.require(:user).permit(:name, :locale))
        show
      end

      # Account deletion (required by the app stores whenever sign-up exists).
      def destroy
        current_user.destroy!
        head :no_content
      end
    end
  end
end

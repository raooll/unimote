module Api
  module V1
    class ScenesController < Api::BaseController
      include Api::SyncedCollection

      private

      def collection = current_user.scenes
      def resource_class = Api::Resources::Scene
      def record_params = params.require(:scene).permit(:name, :icon, :position, steps: %i[remote command delay_ms]).tap { |p| p[:steps] ||= [] }
    end
  end
end

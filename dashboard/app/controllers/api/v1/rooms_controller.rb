module Api
  module V1
    class RoomsController < Api::BaseController
      include Api::SyncedCollection

      private

      def collection = current_user.rooms
      def resource_class = Api::Resources::Room
      def record_params = params.require(:room).permit(:name, :icon, :position)
    end
  end
end

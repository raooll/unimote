module Api
  module V1
    class SavedRemotesController < Api::BaseController
      include Api::SyncedCollection

      private

      def collection = current_user.saved_remotes.includes(:room)
      def resource_class = Api::Resources::SavedRemote

      def record_params
        p = params.require(:saved_remote).permit(:name, :position, :remote_config_id, :room_client_uuid, settings: {})
        attrs = p.to_h.except("room_client_uuid", "settings")
        attrs["room"] = p[:room_client_uuid].present? ? current_user.rooms.find_by!(client_uuid: p[:room_client_uuid]) : nil
        attrs["settings"] = p[:settings].to_h if p.key?(:settings)
        attrs
      end
    end
  end
end

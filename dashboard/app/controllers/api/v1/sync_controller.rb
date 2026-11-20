module Api
  module V1
    # Whole-account sync. Typical use: after the first sign-in, POST everything stored on the
    # device (guest data) so it merges into the account, then GET to receive other devices' data.
    class SyncController < Api::BaseController
      before_action :authenticate_user!
      LIMIT = 200

      def show
        render json: snapshot
      end

      # POST /api/v1/sync { rooms: [...], saved_remotes: [...], scenes: [...] } — each item has client_uuid.
      def create
        body = params.permit(rooms: [%i[client_uuid name icon position]],
                             saved_remotes: [[:client_uuid, :name, :position, :remote_config_id, :room_client_uuid, { settings: {} }]],
                             scenes: [[:client_uuid, :name, :icon, :position, { steps: %i[remote command delay_ms] }]])
        %i[rooms saved_remotes scenes].each do |k|
          return render_error(:unprocessable_content, "too_many", "At most #{LIMIT} #{k} per request") if body[k].to_a.size > LIMIT
        end

        ActiveRecord::Base.transaction do
          body[:rooms].to_a.each { |r| upsert(current_user.rooms, r, r.slice(:name, :icon, :position)) }
          body[:saved_remotes].to_a.each do |r|
            attrs = r.slice(:name, :position, :remote_config_id).to_h
            attrs["room"] = r[:room_client_uuid].present? ? current_user.rooms.find_by!(client_uuid: r[:room_client_uuid]) : nil
            attrs["settings"] = r[:settings].to_h if r.key?(:settings)
            upsert(current_user.saved_remotes, r, attrs)
          end
          body[:scenes].to_a.each { |s| upsert(current_user.scenes, s, s.slice(:name, :icon, :position, :steps).to_h.reverse_merge("steps" => [])) }
        end
        render json: snapshot
      end

      private

      def upsert(scope, item, attrs)
        record = scope.find_or_initialize_by(client_uuid: item.fetch(:client_uuid))
        record.assign_attributes(attrs)
        record.save!
      end

      def snapshot
        {
          rooms: Api::Resources::Room.new(current_user.rooms.order(:position, :id)).to_h,
          saved_remotes: Api::Resources::SavedRemote.new(current_user.saved_remotes.includes(:room).order(:position, :id)).to_h,
          scenes: Api::Resources::Scene.new(current_user.scenes.order(:position, :id)).to_h,
          server_time: Time.current.iso8601(3)
        }
      end
    end
  end
end

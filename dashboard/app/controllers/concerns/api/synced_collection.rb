module Api
  # Shared CRUD for per-user synced records addressed by the client's own UUID, so the app can
  # create things offline and push them later without the server issuing ids.
  #   GET    /collection?updated_since=ISO8601
  #   PUT    /collection/:client_uuid   (upsert)
  #   DELETE /collection/:client_uuid
  module SyncedCollection
    extend ActiveSupport::Concern

    included { before_action :authenticate_user! }

    def index
      scope = collection
      scope = scope.where("updated_at > ?", Time.zone.parse(params[:updated_since])) if params[:updated_since].present?
      render json: { items: resource_class.new(scope.order(:position, :id)).to_h, server_time: Time.current.iso8601(3) }
    end

    def update
      record = upsert!(collection, params[:client_uuid], record_params)
      render json: { item: resource_class.new(record).to_h }
    end

    def destroy
      collection.where(client_uuid: params[:client_uuid]).destroy_all
      head :no_content
    end

    private

    def upsert!(scope, uuid, attrs)
      record = scope.find_or_initialize_by(client_uuid: uuid)
      record.assign_attributes(attrs)
      record.save!
      record
    end
  end
end

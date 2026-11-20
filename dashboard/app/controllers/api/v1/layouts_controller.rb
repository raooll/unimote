module Api
  module V1
    class LayoutsController < Api::BaseController
      def index
        expires_in 1.hour, public: true
        render json: { layouts: Catalog::Layouts.as_json_catalog }
      end
    end
  end
end

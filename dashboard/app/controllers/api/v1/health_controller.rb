module Api
  module V1
    class HealthController < Api::BaseController
      def show
        render json: { status: "ok", version: "v1" }
      end
    end
  end
end

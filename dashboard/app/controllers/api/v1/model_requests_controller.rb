module Api
  module V1
    # POST /api/v1/model_requests { model_request: { brand_name, model_name?, category, notes? } }
    # "Please add this device." Works as a guest; one person counts once per brand/model/category.
    class ModelRequestsController < Api::BaseController
      def create
        p = params.require(:model_request)
        requester = current_user ? "user:#{current_user.id}" : (install_id.present? ? "install:#{install_id}" : nil)
        return render_error(:unprocessable_content, "install_id_required", "Send an X-Install-Id header or sign in") unless requester

        request = ModelRequest.record!(
          brand_name: p[:brand_name].to_s, model_name_text: p[:model_name].to_s, category_slug: p[:category].to_s,
          notes: p[:notes].to_s.first(1000).presence, requester: requester, user: current_user
        )
        render json: { id: request.id, status: request.status, requests_count: request.requests_count }, status: :created
      end
    end
  end
end

module Api
  module V1
    # POST /api/v1/submissions — a user-recorded remote, reviewed by an admin before publishing.
    class SubmissionsController < Api::BaseController
      def create
        p = params.require(:submission)
        sub = ConfigSubmission.create!(
          user: current_user, install_id: install_id,
          brand_name: p[:brand_name].to_s.strip, model_name_text: p[:model_name].to_s.strip,
          category_slug: p[:category].to_s, protocol: p[:protocol].presence || "ir",
          signal_data: p.permit!.to_h.fetch("signal_data", {}), notes: p[:notes].to_s.first(1000)
        )
        render json: { id: sub.id, status: sub.status }, status: :created
      end
    end
  end
end

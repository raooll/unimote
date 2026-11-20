module Api
  module V1
    # POST /api/v1/remotes/:remote_id/reports  { "worked": true }
    # Feedback from the "did your device react?" wizard. Works for guests (X-Install-Id).
    class ReportsController < Api::BaseController
      def create
        config = RemoteConfig.published.find(params[:remote_id])
        report = config.match_reports.create!(worked: ActiveModel::Type::Boolean.new.cast(params.require(:worked)),
                                              user: current_user, install_id: install_id)
        render json: { id: report.id }, status: :created
      end
    end
  end
end

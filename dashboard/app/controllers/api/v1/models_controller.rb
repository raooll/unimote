module Api
  module V1
    # GET /api/v1/models?category=tv&brand=samsung&q=aa59
    # Models with their published configs (summaries only; no signal data).
    class ModelsController < Api::BaseController
      def index
        scope = RemoteModel.with_published.includes(:brand, :device_category, :remote_configs)
        scope = scope.joins(:device_category).where(device_categories: { slug: Catalog::Categories.slugs_with_other(params[:category]) }) if params[:category].present?
        scope = scope.joins(:brand).where(brands: { slug: params[:brand] }) if params[:brand].present?
        scope = params[:q].present? ? scope.search(params[:q]) : scope.ordered_for_app(categorised_first: params[:category].present?)
        page = paginate(scope)
        render json: { models: Api::Resources::Model.new(page).to_h, meta: page_meta(page) }
      end
    end
  end
end

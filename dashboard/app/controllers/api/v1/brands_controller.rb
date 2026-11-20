module Api
  module V1
    # GET /api/v1/brands?category=tv&q=sam
    # Brands that have a published remote (optionally within a category), for the brand picker.
    class BrandsController < Api::BaseController
      def index
        models = RemoteModel.with_published
        models = models.joins(:device_category).where(device_categories: { slug: Catalog::Categories.slugs_with_other(params[:category]) }) if params[:category].present?
        counts = models.group(:brand_id).count

        scope = Brand.where(id: counts.keys)
        scope = params[:q].present? ? scope.search(params[:q]) : scope.ordered
        page = paginate(scope)
        render json: { brands: Api::Resources::Brand.new(page, params: { counts: counts }).to_h, meta: page_meta(page) }
      end
    end
  end
end

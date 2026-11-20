module Api
  module V1
    # GET /api/v1/categories — categories that have at least one published remote.
    class CategoriesController < Api::BaseController
      def index
        counts = RemoteModel.with_published.group(:device_category_id).count
        cats = DeviceCategory.active.ordered.select { |c| counts[c.id].to_i.positive? }
        render json: { categories: Api::Resources::Category.new(cats, params: { counts: counts }).to_h }
      end
    end
  end
end

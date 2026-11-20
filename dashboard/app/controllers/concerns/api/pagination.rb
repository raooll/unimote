module Api
  module Pagination
    extend ActiveSupport::Concern

    DEFAULT_PER = 30
    MAX_PER = 100

    def paginate(scope)
      per = params[:per_page].to_i
      per = DEFAULT_PER unless per.positive?
      scope.page([params[:page].to_i, 1].max).per([per, MAX_PER].min)
    end

    def page_meta(scope)
      { page: scope.current_page, per_page: scope.limit_value, total: scope.total_count, total_pages: scope.total_pages }
    end
  end
end

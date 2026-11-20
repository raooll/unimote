module Api
  class BaseController < ActionController::API
    include Api::ErrorHandling
    include Api::Authentication
    include Api::Pagination

    # Anonymous app installs identify themselves with this header so guests can still
    # send match feedback and submissions without an account.
    def install_id
      request.headers["X-Install-Id"].presence&.slice(0, 64)
    end

    def render_resource(resource_class, object, status: :ok, **params)
      render json: resource_class.new(object, params: params).serialize, status: status
    end
  end
end

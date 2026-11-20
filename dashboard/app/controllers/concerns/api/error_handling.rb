module Api
  # Consistent JSON errors: { "error": { "code": "...", "message": "...", "details": {...} } }
  module ErrorHandling
    extend ActiveSupport::Concern

    included do
      rescue_from ActiveRecord::RecordNotFound do |e|
        render_error(:not_found, "not_found", "#{e.model || 'Record'} not found")
      end
      rescue_from ActiveRecord::RecordInvalid do |e|
        render_error(:unprocessable_content, "invalid", e.record.errors.full_messages.to_sentence, e.record.errors.to_hash)
      end
      rescue_from ActionController::ParameterMissing do |e|
        render_error(:bad_request, "missing_parameter", "Missing parameter: #{e.param}")
      end
    end

    def render_error(status, code, message, details = nil)
      render json: { error: { code: code, message: message, details: details }.compact }, status: status
    end
  end
end

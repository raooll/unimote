Rswag::Api.configure do |c|
  # Serves swagger/v1/openapi.yaml at /api-docs/v1/openapi.yaml
  c.openapi_root = Rails.root.join("swagger").to_s
end

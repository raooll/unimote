Rswag::Ui.configure do |c|
  c.openapi_endpoint "/api-docs/v1/openapi.yaml", "Unimote API v1"
  c.config_object["persistAuthorization"] = true
  c.config_object["tryItOutEnabled"] = true
end

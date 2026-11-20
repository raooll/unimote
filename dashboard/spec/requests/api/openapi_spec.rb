require "rails_helper"

# Guards against the Swagger docs drifting from the real API.
RSpec.describe "OpenAPI documentation", type: :request do
  let(:doc) { YAML.safe_load_file(Rails.root.join("swagger/v1/openapi.yaml"), aliases: true) }

  def api_routes
    Rails.application.routes.routes.filter_map do |r|
      path = r.path.spec.to_s.sub("(.:format)", "")
      next unless path.start_with?("/api/v1")

      verb = r.verb.to_s.downcase
      next if verb.blank?

      [verb, path.gsub(/:(\w+)/, '{\1}')]
    end.uniq
  end

  it "documents every API route" do
    missing = api_routes.reject { |verb, path| doc.dig("paths", path, verb) }
    expect(missing).to be_empty, "Undocumented routes: #{missing.inspect}"
  end

  it "does not document routes that do not exist" do
    real = api_routes
    documented = doc["paths"].flat_map { |path, ops| ops.keys.grep(/\A(get|post|put|patch|delete)\z/).map { |v| [v, path] } }
    expect(documented - real).to be_empty
  end

  it "has resolvable $refs and unique operation ids" do
    refs = []
    walk = lambda do |node|
      case node
      when Hash then node.each { |k, v| k == "$ref" ? refs << v : walk.(v) }
      when Array then node.each(&walk)
      end
    end
    walk.(doc)
    unresolved = refs.reject { |ref| doc.dig(*ref.delete_prefix("#/").split("/")) }
    expect(unresolved).to be_empty

    ids = doc["paths"].values.flat_map { |ops| ops.values.grep(Hash).filter_map { |o| o["operationId"] } }
    expect(ids.size).to eq(ids.uniq.size)
  end

  it "serves the spec and Swagger UI" do
    get "/api-docs/v1/openapi.yaml"
    expect(response).to have_http_status(:ok)
    expect(YAML.safe_load(response.body)["info"]["title"]).to eq("Unimote API")

    get "/api-docs/index.html"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("swagger-ui")
  end
end

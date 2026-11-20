require "rails_helper"

RSpec.describe "Model requests", type: :request do
  let!(:tv) { create(:tv_category) }
  let(:body) { { model_request: { brand_name: "Hisense", model_name: "A6H", category: "tv", notes: "55 inch" } } }

  it "records a guest request" do
    expect { post "/api/v1/model_requests", params: body, headers: { "X-Install-Id" => "dev-1" } }.to change(ModelRequest, :count).by(1)
    expect(response).to have_http_status(:created)
    expect(json).to include("status" => "open", "requests_count" => 1)
  end

  it "counts different people once each, and the same person only once" do
    post "/api/v1/model_requests", params: body, headers: { "X-Install-Id" => "dev-1" }
    post "/api/v1/model_requests", params: body, headers: { "X-Install-Id" => "dev-1" }
    expect(json["requests_count"]).to eq(1)
    post "/api/v1/model_requests", params: { model_request: { brand_name: " hisense ", model_name: "a6h", category: "tv" } }, headers: { "X-Install-Id" => "dev-2" }
    expect(json["requests_count"]).to eq(2)
    expect(ModelRequest.count).to eq(1)
  end

  it "accepts a brand-only request" do
    post "/api/v1/model_requests", params: { model_request: { brand_name: "Zeebo", category: "tv" } }, headers: { "X-Install-Id" => "dev-1" }
    expect(response).to have_http_status(:created)
    expect(ModelRequest.last.model_name_text).to eq("")
  end

  it "rejects an unknown category, a missing brand, and anonymous callers" do
    post "/api/v1/model_requests", params: { model_request: { brand_name: "X", category: "nope" } }, headers: { "X-Install-Id" => "dev-1" }
    expect(response).to have_http_status(:unprocessable_content)
    post "/api/v1/model_requests", params: { model_request: { brand_name: "", category: "tv" } }, headers: { "X-Install-Id" => "dev-1" }
    expect(response).to have_http_status(:unprocessable_content)
    post "/api/v1/model_requests", params: body
    expect(json["error"]["code"]).to eq("install_id_required")
  end

  it "attributes a signed-in user's request to them" do
    user = create(:user)
    post "/api/v1/model_requests", params: body, headers: auth_headers(user)
    expect(ModelRequest.last.user).to eq(user)
    expect(ModelRequest.last.requesters).to eq(["user:#{user.id}"])
  end
end

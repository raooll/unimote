require "rails_helper"

RSpec.describe "Catalog API (guest)", type: :request do
  let!(:tv)  { create(:tv_category) }
  let!(:ac)  { create(:ac_category) }
  let!(:samsung) { create(:brand, name: "Samsung") }
  let!(:lg)      { create(:brand, name: "LG") }
  let!(:model_a) { create(:remote_model, brand: samsung, device_category: tv, name: "AA59-00443A") }
  let!(:model_b) { create(:remote_model, brand: samsung, device_category: tv, name: "BN59-01199F") }
  def signals(pattern) = { "commands" => { "POWER" => { "frequency" => 38_000, "duty_cycle" => 0.33, "pattern" => pattern } } }

  let!(:cfg_a)   { create(:remote_config, remote_model: model_a, popularity: 5, signal_data: signals([9000, 4500, 560, 560])) }
  let!(:cfg_b)   { create(:remote_config, remote_model: model_b, popularity: 50, signal_data: signals([4500, 4500, 560, 1690])) }
  let!(:draft)   { create(:remote_config, remote_model: create(:remote_model, brand: lg, device_category: tv), status: "draft") }

  it "lists layouts" do
    get "/api/v1/layouts"
    expect(response).to have_http_status(:ok)
    expect(json["layouts"].map { |l| l["key"] }).to include("tv_standard", "ac_panel")
  end

  it "lists only categories that have published remotes, with counts" do
    get "/api/v1/categories"
    slugs = json["categories"].map { |c| c["slug"] }
    expect(slugs).to eq(["tv"])
    expect(json["categories"].first["models_count"]).to eq(2)
  end

  it "lists brands for a category and hides brands with only drafts" do
    get "/api/v1/brands", params: { category: "tv" }
    expect(json["brands"].map { |b| b["slug"] }).to eq(["samsung"])
    expect(json["meta"]).to include("page" => 1, "total" => 1)
  end

  it "searches brands by prefix" do
    get "/api/v1/brands", params: { q: "sam" }
    expect(json["brands"].map { |b| b["slug"] }).to eq(["samsung"])
  end

  it "lists models with config summaries (no signal data) and filters by brand" do
    get "/api/v1/models", params: { category: "tv", brand: "samsung" }
    expect(json["models"].size).to eq(2)
    cfg = json["models"].first["configs"].first
    expect(cfg).to include("id", "protocol", "commands_count" => 1)
    expect(cfg).not_to have_key("signal_data")
  end

  it "searches models by model name" do
    get "/api/v1/models", params: { q: "BN59" }
    expect(json["models"].map { |m| m["name"] }).to eq(["BN59-01199F"])
  end

  describe "GET /remotes/:id" do
    it "returns the full remote with its resolved layout" do
      get "/api/v1/remotes/#{cfg_a.id}"
      r = json["remote"]
      expect(r["signal_data"]["commands"]).to include("POWER")
      expect(r["layout"]["sections"]).to be_present
      expect(r["brand"]["slug"]).to eq("samsung")
    end

    it "supports ETag revalidation (304)" do
      get "/api/v1/remotes/#{cfg_a.id}"
      etag = response.headers["ETag"]
      get "/api/v1/remotes/#{cfg_a.id}", headers: { "If-None-Match" => etag }
      expect(response).to have_http_status(:not_modified)
    end

    it "404s for drafts" do
      get "/api/v1/remotes/#{draft.id}"
      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("not_found")
    end
  end

  describe "GET /remotes/match" do
    it "returns candidates best-first, each with a test signal" do
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung" }
      expect(json["candidates"].map { |c| c["id"] }).to eq([cfg_b.id, cfg_a.id])
      expect(json["candidates"].first["test"]).to include("command" => "POWER")
    end

    it "ranks a typed model first" do
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung", model: "aa59" }
      expect(json["candidates"].first["id"]).to eq(cfg_a.id)
    end

    it "requires a category" do
      get "/api/v1/remotes/match", params: { brand: "samsung" }
      expect(response).to have_http_status(:bad_request)
    end

    it "collapses code sets with an identical test signal and reports how many models share it" do
      shared = signals([1000, 2000, 300, 300])
      3.times { |i| create(:remote_config, remote_model: create(:remote_model, brand: samsung, device_category: tv, name: "Twin #{i}"), popularity: 1, signal_data: shared) }
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung" }
      ids = json["candidates"].map { |c| c["id"] }
      expect(ids.size).to eq(3) # cfg_b, cfg_a and ONE of the three twins
      twin = json["candidates"].find { |c| c["model"].start_with?("Twin") }
      expect(twin["shared_by"]).to eq(2)
    end

    it "ranks a code used by many models above a slightly more popular one-off" do
      shared = signals([1000, 2000, 300, 300])
      4.times { |i| create(:remote_config, remote_model: create(:remote_model, brand: samsung, device_category: tv, name: "Twin #{i}"), popularity: 15, signal_data: shared) }
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung" }
      expect(json["candidates"].first["model"]).to start_with("Twin") # 4 x 15 = 60 beats the single 50
    end

    it "lists a Wi-Fi profile ahead of any IR guess" do
      wifi = create(:remote_config, remote_model: create(:remote_model, brand: samsung, device_category: tv, name: "Tizen"), protocol: "wifi", popularity: 0,
                    signal_data: { "driver" => "samsung_tizen", "commands" => { "POWER" => "KEY_POWER" } })
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung" }
      expect(json["candidates"].first["id"]).to eq(wifi.id)
    end

    it "without a brand returns common IR codes across brands" do
      other = create(:remote_config, remote_model: create(:remote_model, brand: lg, device_category: tv, name: "LG 1"), popularity: 99, signal_data: signals([1, 2, 3, 4]))
      get "/api/v1/remotes/match", params: { category: "tv" }
      expect(json["candidates"].map { |c| c["id"] }).to eq([other.id, cfg_b.id, cfg_a.id])
    end

    it "includes a brand's uncategorised remotes after categorised ones, flagged" do
      other = create(:device_category, slug: "other", name: "Other")
      mystery = create(:remote_model, brand: samsung, device_category: other, name: "ZX-9")
      create(:remote_config, remote_model: mystery, popularity: 99, signal_data: signals([5, 5, 5, 5]))
      get "/api/v1/models", params: { category: "tv", brand: "samsung" }
      expect(json["models"].last).to include("name" => "ZX-9", "uncategorised" => true)
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung" }
      expect(json["candidates"].last["model"]).to eq("ZX-9") # popular, but uncategorised: ranked last
      get "/api/v1/remotes/match", params: { category: "tv", brand: "samsung", model: "zx-9" }
      expect(json["candidates"].first["model"]).to eq("ZX-9") # named explicitly: first
      get "/api/v1/models", params: { category: "fan", brand: "samsung" }
      expect(json["models"]).to be_empty # only AV-type categories borrow "other"
    end

    it "labels generic model names" do
      create(:remote_config, remote_model: create(:remote_model, brand: samsung, device_category: tv, name: "2"), popularity: 1, signal_data: signals([7, 7, 7, 7]))
      get "/api/v1/models", params: { category: "tv", brand: "samsung" }
      two = json["models"].find { |m| m["name"] == "2" }
      expect(two).to include("label" => "Code set 2", "display_name" => "Samsung Code set 2")
    end
  end

  describe "POST /remotes/:id/reports" do
    it "records guest feedback by install id and updates popularity" do
      expect {
        post "/api/v1/remotes/#{cfg_a.id}/reports", params: { worked: true }, headers: { "X-Install-Id" => "abc-123" }
      }.to change(MatchReport, :count).by(1)
      expect(response).to have_http_status(:created)
      expect(cfg_a.reload).to have_attributes(success_count: 1, popularity: 8)
    end

    it "rejects feedback with neither an account nor an install id" do
      post "/api/v1/remotes/#{cfg_a.id}/reports", params: { worked: false }
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "POST /submissions" do
    let(:body) do
      { submission: { brand_name: "Acme", model_name: "X1", category: "tv", protocol: "ir",
                      signal_data: { commands: { POWER: { frequency: 38_000, pattern: [9000, 4500, 560] } } } } }
    end

    it "accepts a guest submission as pending" do
      post "/api/v1/submissions", params: body, headers: { "X-Install-Id" => "abc" }, as: :json
      expect(response).to have_http_status(:created)
      expect(ConfigSubmission.last).to have_attributes(status: "pending", brand_name: "Acme")
    end

    it "rejects nonsense signal data" do
      body[:submission][:signal_data][:commands][:POWER][:frequency] = 5
      post "/api/v1/submissions", params: body, headers: { "X-Install-Id" => "abc" }, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end
  end
end

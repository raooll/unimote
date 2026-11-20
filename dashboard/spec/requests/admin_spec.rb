require "rails_helper"

# Smoke test: every admin page renders for a signed-in admin (catches Ransack/column/typo regressions).
RSpec.describe "ActiveAdmin", type: :request do
  let(:admin) { AdminUser.create!(email: "admin@test.dev", password: "password123") }
  let!(:config) { create(:remote_config, popularity: 3) }
  let!(:user) { create(:user) }
  let!(:submission) do
    ConfigSubmission.create!(brand_name: "Acme", model_name_text: "X1", category_slug: config.remote_model.device_category.slug,
                             install_id: "abc", signal_data: { "commands" => { "Vol+" => { "frequency" => 38_000, "pattern" => [9000, 4500, 560] } } })
  end

  before do
    create(:match_report, remote_config: config, install_id: "i") if FactoryBot.factories.registered?(:match_report)
    user.rooms.create!(client_uuid: "r1", name: "Hall")
    user.saved_remotes.create!(client_uuid: "s1", name: "TV", remote_config: config)
    user.scenes.create!(client_uuid: "c1", name: "Off", steps: [{ "command" => "POWER" }])
    sign_in admin, scope: :admin_user
  end

  it "requires admin login" do
    sign_out :admin_user
    get "/admin"
    expect(response).to redirect_to("/admin/login")
  end

  {
    "dashboard" => "/admin", "users" => "/admin/users", "categories" => "/admin/device_categories", "brands" => "/admin/brands",
    "models" => "/admin/remote_models", "remotes" => "/admin/remote_configs", "submissions" => "/admin/config_submissions",
    "feedback" => "/admin/match_reports", "admin users" => "/admin/admin_users"
  }.each do |name, path|
    it "renders the #{name} index" do
      get path
      expect(response).to have_http_status(:ok)
    end
  end

  it "renders show pages" do
    [user, config, config.remote_model, config.remote_model.brand, config.remote_model.device_category, submission].each do |rec|
      get "/admin/#{rec.class.model_name.route_key}/#{rec.id}"
      expect(response).to have_http_status(:ok), "#{rec.class} show failed"
    end
  end

  it "filters and searches without errors" do
    get "/admin/remote_configs", params: { q: { remote_model_brand_id_eq: config.remote_model.brand_id, protocol_eq: "ir" }, scope: "published" }
    expect(response).to have_http_status(:ok)
    get "/admin/users", params: { q: { email_cont: "user" } }
    expect(response).to have_http_status(:ok)
  end

  it "edits a remote's JSON, bumps the version, and rejects invalid JSON" do
    v = config.version
    new_json = JSON.generate("commands" => { "POWER" => { "frequency" => 38_000, "pattern" => [1000, 1000] } })
    put "/admin/remote_configs/#{config.id}", params: { remote_config: { signal_data_json: new_json } }
    expect(response).to redirect_to("/admin/remote_configs/#{config.id}")
    expect(config.reload.version).to eq(v + 1)

    put "/admin/remote_configs/#{config.id}", params: { remote_config: { signal_data_json: "{nope" } }
    expect(response).to have_http_status(:ok) # re-rendered form with errors
    expect(config.reload.version).to eq(v + 1)
  end

  it "approves a submission into a published community remote" do
    expect { put "/admin/config_submissions/#{submission.id}/approve" }.to change(RemoteConfig, :count).by(1)
    cfg = submission.reload.remote_config
    expect(submission).to have_attributes(status: "approved", reviewed_by: admin)
    expect(cfg).to have_attributes(status: "published", source: "community")
    expect(cfg.command_names).to eq(["VOL_UP"]) # "Vol+" normalized to the canonical key
    put "/admin/config_submissions/#{submission.id}/approve" # already approved -> no duplicate
    expect(RemoteConfig.where(external_id: "submission:#{submission.id}").count).to eq(1)
  end

  it "rejects a submission" do
    put "/admin/config_submissions/#{submission.id}/reject"
    expect(submission.reload.status).to eq("rejected")
  end

  it "publishes and unpublishes via batch actions" do
    post "/admin/remote_configs/batch_action", params: { batch_action: "unpublish", collection_selection: [config.id] }
    expect(config.reload.status).to eq("draft")
    post "/admin/remote_configs/batch_action", params: { batch_action: "publish", collection_selection: [config.id] }
    expect(config.reload.status).to eq("published")
  end
end

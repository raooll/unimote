require "rails_helper"

RSpec.describe "Optional login + sync API", type: :request do
  describe "auth" do
    it "signs up, returns a token that works on /me" do
      post "/api/v1/auth/sign_up", params: { user: { email: "A@Example.com", password: "password123", name: "Asha" } }, as: :json
      expect(response).to have_http_status(:created)
      token = json["token"]
      expect(json["user"]["email"]).to eq("a@example.com")

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(json["user"]["name"]).to eq("Asha")
    end

    it "rejects weak passwords and duplicate emails" do
      post "/api/v1/auth/sign_up", params: { user: { email: "a@example.com", password: "short" } }, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      create(:user, email: "dup@example.com")
      post "/api/v1/auth/sign_up", params: { user: { email: "dup@example.com", password: "password123" } }, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "signs in with valid credentials only" do
      user = create(:user)
      post "/api/v1/auth/sign_in", params: { user: { email: user.email, password: "password123" } }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["token"]).to be_present
      post "/api/v1/auth/sign_in", params: { user: { email: user.email, password: "nope" } }, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]["code"]).to eq("invalid_credentials")
    end

    it "sign out revokes the token" do
      user = create(:user)
      headers = auth_headers(user)
      get "/api/v1/me", headers: headers
      expect(response).to have_http_status(:ok)
      delete "/api/v1/auth/sign_out", headers: headers
      expect(response).to have_http_status(:no_content)
      get "/api/v1/me", headers: headers
      expect(response).to have_http_status(:unauthorized)
    end

    it "requires login for protected endpoints, but not for the catalog" do
      get "/api/v1/me"
      expect(response).to have_http_status(:unauthorized)
      get "/api/v1/rooms"
      expect(response).to have_http_status(:unauthorized)
      get "/api/v1/categories"
      expect(response).to have_http_status(:ok)
    end

    it "does not reveal whether an email exists on password reset" do
      create(:user, email: "real@example.com")
      post "/api/v1/auth/password", params: { email: "real@example.com" }, as: :json
      expect(response).to have_http_status(:accepted)
      post "/api/v1/auth/password", params: { email: "ghost@example.com" }, as: :json
      expect(response).to have_http_status(:accepted)
    end

    it "resets a password with a valid token and deletes the account" do
      user = create(:user)
      raw = user.send_reset_password_instructions
      put "/api/v1/auth/password", params: { reset_password_token: raw, password: "brandnew123" }, as: :json
      expect(response).to have_http_status(:ok)
      expect(user.reload.valid_password?("brandnew123")).to be(true)

      delete "/api/v1/me", headers: auth_headers(user)
      expect(response).to have_http_status(:no_content)
      expect(User.exists?(user.id)).to be(false)
    end
  end

  describe "synced data" do
    let(:user) { create(:user) }
    let(:other) { create(:user) }
    let(:headers) { auth_headers(user) }

    it "upserts rooms by client uuid and keeps users isolated" do
      put "/api/v1/rooms/room-1", params: { room: { name: "Living Room", position: 1 } }, headers: headers, as: :json
      put "/api/v1/rooms/room-1", params: { room: { name: "Lounge" } }, headers: headers, as: :json
      expect(user.rooms.count).to eq(1)
      expect(user.rooms.first.name).to eq("Lounge")

      get "/api/v1/rooms", headers: auth_headers(other)
      expect(json["items"]).to be_empty
    end

    it "saves a remote into a room and deletes it" do
      config = create(:remote_config)
      put "/api/v1/rooms/room-1", params: { room: { name: "Bedroom" } }, headers: headers, as: :json
      put "/api/v1/saved_remotes/r-1", headers: headers, as: :json,
          params: { saved_remote: { name: "Bedroom AC", remote_config_id: config.id, room_client_uuid: "room-1",
                                    settings: { ip: "192.168.1.9", last_state: { temp: 24 } } } }
      expect(response).to have_http_status(:ok)
      item = json["item"]
      expect(item).to include("room_client_uuid" => "room-1", "remote_config_id" => config.id)
      expect(item["settings"]["last_state"]["temp"]).to eq(24)

      delete "/api/v1/saved_remotes/r-1", headers: headers
      expect(response).to have_http_status(:no_content)
      expect(user.saved_remotes.count).to eq(0)
    end

    it "validates scene steps" do
      put "/api/v1/scenes/s-1", headers: headers, as: :json,
          params: { scene: { name: "Movie night", steps: [{ remote: "r-1", command: "POWER", delay_ms: 200 }] } }
      expect(response).to have_http_status(:ok)
      put "/api/v1/scenes/s-2", headers: headers, as: :json, params: { scene: { name: "Bad", steps: [{ remote: "r-1" }] } }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "bulk-merges guest data on first sign-in and returns the snapshot" do
      post "/api/v1/sync", headers: headers, as: :json, params: {
        rooms: [{ client_uuid: "a", name: "Hall" }],
        saved_remotes: [{ client_uuid: "x", name: "TV", room_client_uuid: "a" }],
        scenes: [{ client_uuid: "s", name: "Off", steps: [{ remote: "x", command: "POWER" }] }]
      }
      expect(response).to have_http_status(:ok)
      expect(json["saved_remotes"].first["room_client_uuid"]).to eq("a")
      get "/api/v1/sync", headers: headers
      expect(json.values_at("rooms", "saved_remotes", "scenes").map(&:size)).to eq([1, 1, 1])
    end
  end
end

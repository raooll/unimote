module ApiHelpers
  def json = JSON.parse(response.body)

  def auth_headers(user, extra = {})
    token = Warden::JWTAuth::UserEncoder.new.call(user, :user, nil).first
    { "Authorization" => "Bearer #{token}" }.merge(extra)
  end
end

RSpec.configure do |c|
  c.include ApiHelpers, type: :request
  c.include FactoryBot::Syntax::Methods
end

RSpec.configure do |c|
  c.include Devise::Test::IntegrationHelpers, type: :request
end

# Basic abuse protection for the public API.
class Rack::Attack
  throttle("api/ip", limit: 300, period: 5.minutes) { |req| req.ip if req.path.start_with?("/api/") }
  throttle("auth/ip", limit: 20, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/auth/") && !req.get? }
  throttle("auth/email", limit: 8, period: 5.minutes) do |req|
    if req.path.start_with?("/api/v1/auth/sign_in") && req.post?
      JSON.parse(req.body.tap(&:rewind).read).dig("user", "email").to_s.downcase.presence rescue nil
    end
  end
  throttle("submissions/ip", limit: 10, period: 1.hour) { |req| req.ip if req.path == "/api/v1/submissions" && req.post? }
  throttle("model_requests/ip", limit: 20, period: 1.hour) { |req| req.ip if req.path == "/api/v1/model_requests" && req.post? }
  throttle("admin_login/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/admin/login" && req.post?
  end
end

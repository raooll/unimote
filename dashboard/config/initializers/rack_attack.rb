# Basic abuse protection for the public API.
class Rack::Attack
  throttle("api/ip", limit: 300, period: 5.minutes) { |req| req.ip if req.path.start_with?("/api/") }
  throttle("admin_login/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/admin/login" && req.post?
  end
end

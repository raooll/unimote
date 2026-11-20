require "rails_helper"

RSpec.describe "Root", type: :request do
  it "redirects to the API docs" do
    get "/"
    expect(response).to redirect_to("/api-docs")
  end
end

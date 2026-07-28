require "test_helper"

class OwnerControllerTest < ActionDispatch::IntegrationTest
  test "should get dashboard" do
    get owner_dashboard_url
    assert_response :success
  end
end

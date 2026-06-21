require "test_helper"

class MedicinesControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    get medicines_index_url
    assert_response :success
  end
end

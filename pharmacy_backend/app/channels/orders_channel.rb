class OrdersChannel < ApplicationCable::Channel
  def subscribed
    # This sets up the real-time radio frequency for our pharmacy
    stream_from "orders_channel"
  end

  def unsubscribed
    # Any cleanup when a user closes their tab goes here
  end
end
class OrdersController < ApplicationController
  # POST /orders
  def create
    # Wrap everything in a transaction so if anything fails, nothing is saved to the DB
    ActiveRecord::Base.transaction do
      @order = Order.new(status: 'pending')
      total = 0.0

      # Expecting params format: { items: [{ medicine_id: 1, quantity: 2 }, ...] }
      params[:items].each do |item_param|
        medicine = Medicine.find(item_param[:medicine_id])
        quantity = item_param[:quantity].to_i

        # Optional: Check if there's enough stock right here before allowing order creation
        if medicine.stock_quantity < quantity
          raise ActiveRecord::Rollback, "Not enough stock for #{medicine.name}"
        end

        price_at_sale = medicine.price
        total += price_at_sale * quantity

        @order.order_items.build(
          medicine: medicine,
          quantity: quantity,
          price_at_sale: price_at_sale
        )
      end

      @order.total_amount = total

      if @order.save
        render json: @order.as_json(include: :order_items), status: :created
      else
        render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
      end
    end
  rescue => e
    render json: { error: e.message }, status: :bad_request
  end
end
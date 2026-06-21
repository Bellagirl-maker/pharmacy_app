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

  # PATCH /orders/:id
  def update
    @order = Order.find(params[:id])

    if @order.status == 'pending'
      # --- CASHIER STEP: Process Payment ---
      ActiveRecord::Base.transaction do
        @order.order_items.each do |item|
          medicine = item.medicine
          new_stock = medicine.stock_quantity - item.quantity
          
          if new_stock < 0
            raise ActiveRecord::Rollback, "Insufficient stock for #{medicine.name}"
          end
          medicine.update!(stock_quantity: new_stock)
        end

        if @order.update(status: 'paid')
          render json: @order.as_json(include: :order_items), status: :ok
        else
          render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
        end
      end

    elsif @order.status == 'paid'
      # --- DISPENSARY STEP: Hand Over Medicine ---
      if @order.update(status: 'dispensed')
        render json: @order.as_json(include: :order_items), status: :ok
      else
        render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
      end

    else
      render json: { error: "Order has already been fully dispensed and closed." }, status: :unprocessable_entity
    end
  end
end
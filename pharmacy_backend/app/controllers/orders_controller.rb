class OrdersController < ApplicationController
  # GET /orders
  def index
    @orders = Order.all.order(created_at: :desc)
    render json: @orders.as_json(include: :order_items)
  end
  
  # POST /orders
  def create
    items_param = params[:items] || []
    if items_param.empty?
      render json: { error: "No items selected" }, status: :bad_request
      return
    end

    @order = nil

    ActiveRecord::Base.transaction do
      @order = Order.new(status: 'pending')
      total = 0.0

      items_param.each do |item_param|
        medicine = Medicine.find(item_param[:medicine_id])
        quantity = item_param[:quantity].to_i

        if medicine.total_stock < quantity
          raise "Not enough stock for #{medicine.name}"
        end

        price_at_sale = medicine.price
        total += price_at_sale * quantity

        # FIXED: Reverted 'price:' back to your exact schema column 'price_at_sale:'
        @order.order_items.build(
          medicine: medicine,
          quantity: quantity,
          price_at_sale: price_at_sale
        )
      end

      @order.total_amount = total

      if @order.save
        ActionCable.server.broadcast("orders_channel", { event: 'order_created', order: @order.as_json(include: :order_items) })
        render json: @order.as_json(include: :order_items), status: :created
      else
        render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
        raise ActiveRecord::Rollback
      end
    end
  rescue => e
    render json: { error: e.message }, status: :bad_request
  end
  # PATCH /orders/:id
 def update
  @order = Order.find(params[:id])

  if @order.status == 'pending'
    # 🔍 CHECK: Did the frontend explicitly ask to cancel/void this ticket?
    if params[:order] && (params[:order][:status] == 'cancelled' || params[:order][:status] == 'voided')
      if @order.update(status: 'cancelled')
        # 📣 BROADCAST THE CANCELLATION EXPLICITLY:
        ActionCable.server.broadcast("orders_channel", { 
          event: 'order_cancelled', 
          order: @order.as_json(include: :order_items) 
        })
        render json: @order.as_json(include: :order_items), status: :ok
      else
        render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
      end
      return # Exit out early so it doesn't drop down into checkout code
    end

    # --- STANDARD CHECKOUT/PAYMENT FLOW ---
    ActiveRecord::Base.transaction do
      @order.order_items.each do |item|
        medicine = item.medicine
        requested_qty = item.quantity

        # FEFO Batch Allocation logic
        available_batches = medicine.batches.where('expiry_date > ?', Date.today).order(expiry_date: :asc)
        
        if medicine.total_stock < requested_qty
          raise "Insufficient stock for #{medicine.name}"
        end

        available_batches.each do |batch|
          next if requested_qty <= 0
          
          if batch.quantity >= requested_qty
            batch.update!(quantity: batch.quantity - requested_qty)
            requested_qty = 0
          else
            requested_qty -= batch.quantity
            batch.update!(quantity: 0)
          end
        end
      end

      if @order.update(status: 'paid')
        # 📣 REAL-TIME BROADCAST: Standard Payment
        ActionCable.server.broadcast("orders_channel", { event: 'order_paid', order: @order.as_json(include: :order_items) })
        render json: @order.as_json(include: :order_items), status: :ok
      else
        render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
        raise ActiveRecord::Rollback
      end
    end

  elsif @order.status == 'paid'
    if @order.update(status: 'dispensed')
      # 📣 REAL-TIME BROADCAST: Clear from queues
      ActionCable.server.broadcast("orders_channel", { event: 'order_dispensed', order: @order.as_json(include: :order_items) })
      render json: @order.as_json(include: :order_items), status: :ok
    else
      render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
    end

  else
    render json: { error: "Order has already been fully dispensed and closed." }, status: :unprocessable_entity
  end

rescue => e
  render json: { error: e.message }, status: :bad_request
end

  # PATCH /orders/:id/cancel
  def cancel
    @order = Order.find(params[:id])

    if @order.status != 'pending'
      render json: { error: "Only pending orders can be cancelled. Current status is #{@order.status}" }, status: :unprocessable_entity
      return
    end

    ActiveRecord::Base.transaction do
      @order.update!(status: 'cancelled')

      @order.order_items.each do |item|
        target_batch = item.medicine.batches.where('expiry_date > ?', Date.current).first
        if target_batch
          target_batch.increment!(:quantity, item.quantity)
        end
      end
    end

    ActionCable.server.broadcast("orders_channel", { event: 'order_paid', order: @order.as_json(include: :order_items) })
    render json: @order.as_json(include: :order_items), status: :ok
  rescue => e
    # 🚨 This line sends the EXACT system failure message back to your React frontend!
    render json: { error: "Database/Server Error: #{e.message}" }, status: :internal_server_error
  end
end
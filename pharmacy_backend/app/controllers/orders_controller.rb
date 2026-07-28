class OrdersController < ApplicationController
  # 🎯 Force authentication across these mutation actions so current_manager is populated
  before_action :authorize_request, only: [:create, :update, :cancel]

  # GET /orders
  def index
    # Eager loading order_items avoids the N+1 database querying issue seen in the logs!
    @orders = Order.all.includes(:order_items).order(created_at: :desc)
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
      # 🎯 Assign this new order ticket directly to the logged-in manager
      @order = Order.new(status: 'pending', manager: current_manager)
      total = 0.0

      items_param.each do |item_param|
        medicine = Medicine.find(item_param[:medicine_id])
        quantity = item_param[:quantity].to_i

        if medicine.total_stock < quantity
          raise "Not enough stock for #{medicine.name}"
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
        # 🎯 Audit Footprint: Record order creation
        AuditLog.create!(
          manager_id: current_manager.id,
          action_type: "ORDER_CREATED",
          trackable: @order,
          details: "Manager #{current_manager.username} created order ##{@order.id} with a total value of GHS #{@order.total_amount}."
        )

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
          # 🎯 Audit Footprint: Record inline order cancellation
          AuditLog.create!(
            manager_id: current_manager.id,
            action_type: "ORDER_CANCELLED",
            trackable: @order,
            details: "Pending order ##{@order.id} was explicitly cancelled/voided by #{current_manager.username}."
          )

          ActionCable.server.broadcast("orders_channel", { 
            event: 'order_cancelled', 
            order: @order.as_json(include: :order_items) 
          })
          render json: @order.as_json(include: :order_items), status: :ok
        else
          render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
        end
        return 
      end

      # --- STANDARD CHECKOUT/PAYMENT FLOW ---
      ActiveRecord::Base.transaction do
        @order.order_items.each do |item|
          medicine = item.medicine
          requested_qty = item.quantity

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
          # 🎯 Audit Footprint: Record order checkout completion
          AuditLog.create!(
            manager_id: current_manager.id,
            action_type: "ORDER_PAID",
            trackable: @order,
            details: "Order ##{@order.id} updated to 'paid' following checkout processing by #{current_manager.username}."
          )

          ActionCable.server.broadcast("orders_channel", { event: 'order_paid', order: @order.as_json(include: :order_items) })
          render json: @order.as_json(include: :order_items), status: :ok
        else
          render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
          raise ActiveRecord::Rollback
        end
      end

    elsif @order.status == 'paid'
      if @order.update(status: 'dispensed')
        # 🎯 Audit Footprint: Record physical inventory dispensing
        AuditLog.create!(
          manager_id: current_manager.id,
          action_type: "ORDER_DISPENSED",
          trackable: @order,
          details: "Order ##{@order.id} marked as 'dispensed' and handed off to customer by #{current_manager.username}."
        )

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

      # 🎯 Audit Footprint: Record standard route cancellation + stock return
      AuditLog.create!(
        manager_id: current_manager.id,
        action_type: "ORDER_CANCELLED",
        trackable: @order,
        details: "Pending order ##{@order.id} was cancelled by #{current_manager.username}. Order quantities reverted to pharmacy batches."
      )
    end

    ActionCable.server.broadcast("orders_channel", { event: 'order_cancelled', order: @order.as_json(include: :order_items) })
    render json: @order.as_json(include: :order_items), status: :ok
  rescue => e
    render json: { error: "Database/Server Error: #{e.message}" }, status: :internal_server_error
  end
end
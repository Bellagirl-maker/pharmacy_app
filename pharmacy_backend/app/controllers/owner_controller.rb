# app/controllers/owner_controller.rb
class OwnerController < ApplicationController
  before_action :authorize_request
  before_action :require_owner

  def dashboard
    # 1. Financials Summary (Gross Sales Today)
    @today_sales = Order.where(status: ['paid', 'dispensed'])
                        .where('updated_at >= ?', Date.current.beginning_of_day)
                        .sum(:total_amount)

    # 2. Safety Inventory Triggers
    @low_stock = Medicine.all.select { |m| m.total_stock < 20 }.map do |m|
      { name: m.name, stock: m.total_stock }
    end

    # 3. Compliance Expiration Audits
    @expiring_soon = Batch.where(expiry_date: Date.current..(Date.current + 90.days)).map do |b|
      { medicine_name: b.medicine.name, batch: b.batch_number, expires_on: b.expiry_date.to_s, quantity: b.quantity }
    end

    @expired = Batch.where('expiry_date <= ?', Date.current).map do |b|
      { medicine_name: b.medicine.name, batch: b.batch_number, expired_on: b.expiry_date.to_s, quantity: b.quantity }
    end

    # 4. Void Log Audit Trail Collection
    @void_logs = Order.where(status: 'cancelled')
                      .order(updated_at: :desc)
                      .map do |order|
                        {
                          id: order.id,
                          total_amount: order.total_amount,
                          voided_at: order.updated_at.strftime("%I:%M %p (%d %b)")
                        }
                      end

    # 🔍 5. NEW: Complete Staff Activity Audit Trail Collection
    # Eager loading :manager and :trackable to prevent N+1 query performance drops
    @audit_logs = AuditLog.includes(:manager, :trackable)
                          .order(created_at: :desc)
                          .limit(50)
                          .map do |log|
                            {
                              id: log.id,
                              action_type: log.action_type.to_s.humanize,
                              performed_by: log.manager ? log.manager.username : "System",
                              role: log.manager ? log.manager.role.to_s.upcase : "N/A",
                              target: log.trackable ? "#{log.trackable_type} ##{log.trackable_id}" : "N/A",
                              timestamp: log.created_at.strftime("%I:%M %p (%d %b)")
                            }
                          end

    # Render everything in a single, neat JSON bundle
    render json: {
      today_sales: @today_sales,
      low_stock_alerts: @low_stock,
      expiring_soon: @expiring_soon,
      expired_alerts: @expired,
      void_logs: @void_logs,
      audit_logs: @audit_logs # Shipped directly to React!
    }
  end

  private

  def require_owner
    unless current_manager&.role.to_s.downcase == 'owner'
      render json: { error: "Access denied. Administrative authority required." }, status: :forbidden
    end
  end
end
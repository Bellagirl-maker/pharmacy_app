import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatCurrency } from '../utils/formatters';
import api from '../api';

// --- HELPER 1: Universal Order Total Extractor ---
const getOrderTotal = (order) => {
  if (!order) return 0;

  const directValue =
    order.total_price ??
    order.total_amount ??
    order.grand_total ??
    order.total ??
    order.amount ??
    order.totalPrice ??
    order.grandTotal ??
    order.price;

  const numericValue = Number(directValue);
  if (!isNaN(numericValue) && numericValue > 0) return numericValue;

  const lineItems = order.items || order.order_items || order.line_items || order.cart;
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    return lineItems.reduce((sum, item) => {
      const price = Number(item.price || item.unit_price || item.cost || 0);
      const qty = Number(item.quantity || item.qty || item.count || 1);
      return sum + price * qty;
    }, 0);
  }

  return 0;
};

// --- HELPER 2: Strict Today's Date Checker ---
const isToday = (dateString) => {
  if (!dateString) return false;
  const orderDate = new Date(dateString);
  const today = new Date();

  return (
    !isNaN(orderDate.getTime()) &&
    orderDate.getDate() === today.getDate() &&
    orderDate.getMonth() === today.getMonth() &&
    orderDate.getFullYear() === today.getFullYear()
  );
};

export default function OwnerDashboard({ orders = [], isNetworkOnline })  {
  const [activeTab, setActiveTab] = useState('analytics');

  const [data, setData] = useState({
    today_sales: 0,
    low_stock_alerts: [],
    expiring_soon: [],
    expired_alerts: [],
    void_logs: [],
    audit_logs: []
  });
  const [isLoading, setIsLoading] = useState(true);

  const [staffList, setStaffList] = useState([]);
  const [newStaff, setNewStaff] = useState({ username: '', password: '', role: 'counter' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const [resetModal, setResetModal] = useState({
    isOpen: false,
    userId: null,
    username: '',
    tempPassword: 'ChangeMe123!'
  });

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get('/owner/dashboard');
      setData(response.data || {});
    } catch (err) {
      console.error('Dashboard data fetch failed:', err);
      setErrorMessage('Failed to fetch management metrics. Ensure backend is active.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStaffRoster = useCallback(async () => {
    try {
      setErrorMessage(null);
      const response = await api.get('/managers');
      setStaffList(response.data || []);
    } catch (err) {
      console.error('Failed to fetch staff roster:', err);
      setErrorMessage(err.response?.data?.error || 'Could not retrieve user directory.');
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaffRoster();
    }
  }, [activeTab, fetchStaffRoster]);

  const checkIsVoided = useCallback((order) => {
    if (!order) return false;
    const status = String(order.status || '').toLowerCase();
    const action = String(order.action || '').toLowerCase();
    const event = String(order.event || '').toLowerCase();

    return (
      status === 'voided' ||
      status === 'cancelled' ||
      action === 'void' ||
      action === 'cancel' ||
      event.includes('void') ||
      event.includes('cancel')
    );
  }, []);

  const liveVoidedTickets = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders.filter((order) => checkIsVoided(order));
  }, [orders, checkIsVoided]);

  // FIXED: Properly preserve the user who VOIDED the ticket (e.g. Bella) 
  // instead of letting the original order creator (e.g. Sandra) overwrite it.
  const displayVoidLogs = useMemo(() => {
    const combinedRegistry = {};

    if (Array.isArray(data.void_logs)) {
      data.void_logs.forEach((log) => {
        if (log && (log.id || log.order_id)) {
          const key = log.id || log.order_id;
          combinedRegistry[key] = log;
        }
      });
    }

    liveVoidedTickets.forEach((ticket) => {
      const targetId = ticket.id || ticket.order_id;
      if (targetId) {
        const existingLog = combinedRegistry[targetId] || {};
        
        // Prioritize explicit void/cancelled actor fields over order creator fields
        const voidActor =
          existingLog.voided_by ||
          existingLog.cancelled_by ||
          existingLog.performed_by ||
          ticket.voided_by ||
          ticket.cancelled_by ||
          ticket.performed_by ||
          existingLog.manager_username ||
          ticket.manager_username ||
          ticket.created_by;

        const orderCreator =
          ticket.created_by ||
          ticket.creator ||
          (existingLog.created_by !== voidActor ? existingLog.created_by : null);

        combinedRegistry[targetId] = {
          ...existingLog,
          ...ticket,
          id: targetId,
          status: 'VOIDED',
          performed_by: voidActor,
          created_by: orderCreator
        };
      }
    });

    return Object.values(combinedRegistry).sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || a.timestamp || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || b.timestamp || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
  }, [liveVoidedTickets, data.void_logs]);

  const computedSalesToday = useMemo(() => {
    if (Array.isArray(orders) && orders.length > 0) {
      return orders
        .filter((o) => {
          const status = String(o.status || '').toLowerCase();
          const isPaidStatus = status === 'paid' || status === 'completed';
          const orderDate = o.created_at || o.timestamp || o.date;
          return isPaidStatus && !checkIsVoided(o) && isToday(orderDate);
        })
        .reduce((sum, o) => sum + getOrderTotal(o), 0);
    }
    return Number(data.today_sales || 0);
  }, [orders, data.today_sales, checkIsVoided]);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      ...newStaff,
      username: newStaff.username.toLowerCase().trim()
    };

    try {
      await api.post('/managers', { manager: payload });
      alert(`Account for "${payload.username}" successfully provisioned!`);
      setNewStaff({ username: '', password: '', role: 'counter' });
      fetchStaffRoster();
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to create staff account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResetModal = (id, username) => {
    setResetModal({
      isOpen: true,
      userId: id,
      username: username,
      tempPassword: 'ChangeMe123!'
    });
  };

  const handleConfirmResetPassword = async (e) => {
    e.preventDefault();
    const { userId, username, tempPassword } = resetModal;
    if (!tempPassword) return;

    try {
      await api.post(`/managers/${userId}/reset_password`, { temp_password: tempPassword });
      alert(`Password successfully reset for ${username}.`);
      setResetModal({ isOpen: false, userId: null, username: '', tempPassword: '' });
      fetchStaffRoster();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reset password.');
    }
  };

  const handleDeleteStaff = async (id, name) => {
    if (name === 'admin') {
      alert('Security Guard: You cannot delete the primary master administrative account!');
      return;
    }
    if (!window.confirm(`Are you sure you want to revoke access for ${name}?`)) return;

    try {
      await api.delete(`/managers/${id}`);
      fetchStaffRoster();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove account.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500 font-medium">
        Loading management systems analytics...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-5 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
  <h2 className="text-2xl font-black text-gray-800 tracking-tight">Owner Control Tower</h2>
  <button
    onClick={fetchDashboardData}
    className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 transition-all"
  >
    🔄 Refresh
  </button>
</div>
<p className="text-xs text-gray-500">
  Audit system performance, process inventory analytics, and manage active staff clearances.
</p>
        </div>

        <div className="flex bg-gray-200/80 p-1 rounded-xl border border-gray-300/30">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 font-black text-xs uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'analytics'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Sales Analytics
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 font-black text-xs uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'staff'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            👥 Manage Staff Tiers
          </button>
        </div>
      </div>

      {!isNetworkOnline && (
  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-sm font-semibold text-amber-700">
    <span>📴</span> <p>Offline Mode — showing last cached data. Connect to internet to refresh.</p>
  </div>
)}
{errorMessage && isNetworkOnline && (
  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm font-semibold text-red-700">
    <span>⚠️</span> <p>{errorMessage}</p>
  </div>
)}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-bold uppercase text-gray-400 block mb-1">Gross Revenue (Today)</span>
              <div className="text-3xl font-black text-emerald-600">
                {formatCurrency ? formatCurrency(computedSalesToday) : `GH₵ ${computedSalesToday.toFixed(2)}`}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-bold uppercase text-gray-400 block mb-1">Critical Low Stock Items</span>
              <div className="text-3xl font-black text-orange-500">
                {data.low_stock_alerts?.length || 0} Products
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-bold uppercase text-gray-400 block mb-1">Expiring (90 Days)</span>
              <div className="text-3xl font-black text-blue-600">
                {data.expiring_soon?.length || 0} Batches
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
              <span className="text-xs font-bold uppercase text-gray-400 block mb-1">Expired Loss Total</span>
              <div className="text-3xl font-black text-red-600">
                {data.expired_alerts?.length || 0} Batches
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2 mb-4">
                  <span>⚠️</span> Safety Stock Trigger Alerts
                </h3>
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-400 tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-left">Medication</th>
                        <th className="px-4 py-3 text-right">Remaining Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-bold">
                      {data.low_stock_alerts?.map((item) => (
                        <tr key={item.id || item.name} className="hover:bg-gray-50/50">
                          <td className="px-4 py-4 text-gray-800">{item.name}</td>
                          <td className="px-4 py-4 text-right text-red-600 font-mono">{item.stock} units</td>
                        </tr>
                      ))}
                      {(!data.low_stock_alerts || data.low_stock_alerts.length === 0) && (
                        <tr>
                          <td colSpan="2" className="text-center p-4 text-sm text-gray-400 font-medium">
                            All medicine inventory thresholds are secure.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2 mb-4">
                  <span>📋</span> Compliance Expiration Audit
                </h3>
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-black uppercase text-red-600 tracking-wider block mb-2">
                      ❌ Expired Inventory (Immediate Pull)
                    </span>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y text-sm">
                      {data.expired_alerts?.map((b) => (
                        <div
                          key={b.id || `${b.medicine_name}-${b.batch}`}
                          className="p-4 bg-white flex justify-between items-center shadow-2xs"
                        >
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm">{b.medicine_name}</h4>
                            <p className="text-xs text-gray-400 font-mono">Batch: {b.batch}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-red-600 block">Expired: {b.expired_on}</span>
                            <span className="text-xs text-gray-400 font-medium">{b.quantity} units</span>
                          </div>
                        </div>
                      ))}
                      {(!data.expired_alerts || data.expired_alerts.length === 0) && (
                        <p className="p-3 text-center text-gray-400 text-xs font-medium">
                          No expired inventory recorded.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-black uppercase text-orange-500 tracking-wider block mb-2">
                      ⏳ Expiring Within 90 Days
                    </span>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y text-sm">
                      {data.expiring_soon?.map((b) => (
                        <div
                          key={b.id || `${b.medicine_name}-${b.batch}`}
                          className="p-4 bg-white flex justify-between items-center shadow-2xs"
                        >
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm">{b.medicine_name}</h4>
                            <p className="text-xs text-gray-400 font-mono">Batch: {b.batch}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-amber-600 block">Expires: {b.expires_on}</span>
                            <span className="text-xs text-gray-400 font-medium">{b.quantity} units</span>
                          </div>
                        </div>
                      ))}
                      {(!data.expiring_soon || data.expiring_soon.length === 0) && (
                        <p className="p-3 text-center text-gray-400 text-xs font-medium">
                          No upcoming batch expirations inside 90 days.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
              {/* VOID LOGS CARD */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2 mb-1">
                  <span>🛡️</span> Security Void Trail
                </h3>
                <p className="text-xs text-gray-400 mb-4">Unfiltered log collection of cancelled/voided invoices.</p>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {displayVoidLogs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4 font-medium">
                      No recent void actions logged.
                    </p>
                  ) : (
                    displayVoidLogs.map((ticket) => {
                      const ticketAmount = getOrderTotal(ticket);
                      const rawDate = ticket.updated_at || ticket.created_at || ticket.timestamp;
                      const parsedDate = rawDate ? new Date(rawDate) : new Date();
                      const ticketDate = isNaN(parsedDate.getTime())
                        ? 'N/A'
                        : parsedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                      const ticketTime = isNaN(parsedDate.getTime())
                        ? ''
                        : parsedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                      const voidActor = ticket.performed_by || ticket.voided_by || ticket.cancelled_by || 'Unknown';
                      const originalCreator = ticket.created_by;

                      return (
                        <div
                          key={ticket.id || ticket.order_id}
                          className="p-4 border-l-4 border-l-red-500 border border-gray-200 rounded-xl bg-white shadow-2xs flex justify-between items-start transition-all hover:bg-gray-50"
                        >
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm">Ref #{ticket.id || ticket.order_id}</h4>
                            <p className="text-xs text-red-600 font-black tracking-wider uppercase mt-1">
                              Voided By: <span className="font-extrabold text-gray-900">@{voidActor}</span>
                            </p>
                            {originalCreator && originalCreator !== voidActor && (
                              <p className="text-[10px] text-gray-400 font-medium">
                                Created by @{originalCreator}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex flex-col justify-between items-end">
                            <span className="text-sm font-black text-red-600 font-mono">
                              {formatCurrency ? formatCurrency(ticketAmount) : `GH₵ ${ticketAmount.toFixed(2)}`}
                            </span>
                            <span className="text-[10px] text-gray-400 block mt-2 font-medium">
                              {ticketTime} ({ticketDate})
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* AUDIT LOGS CARD */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2 mb-1">
                  <span>📋</span> Live Audit Logs
                </h3>
                <p className="text-xs text-gray-400 mb-4">Real-time chronicle across active staff accounts.</p>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
                  {!data.audit_logs || data.audit_logs.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No operations logged today.</p>
                  ) : (
                    data.audit_logs.map((log, idx) => {
                      // FIXED: Explicitly prioritize who performed the void/action over who originally created the ticket
                      const actor =
                        log.voided_by ||
                        log.cancelled_by ||
                        log.performed_by ||
                        log.action_user ||
                        log.manager_username ||
                        'system';

                      const creator = log.created_by || log.order_creator;
                      const role = log.role ? ` (${log.role.toUpperCase()})` : '';
                      const target = log.target || log.details || '';
                      const rawTimestamp = log.timestamp || log.created_at;
                      const parsedTime = rawTimestamp ? new Date(rawTimestamp) : null;
                      const formattedTime =
                        parsedTime && !isNaN(parsedTime.getTime())
                          ? parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';

                      return (
                        <div
                          key={log.id || `${rawTimestamp}-${idx}`}
                          className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs text-xs flex flex-col gap-1 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-black text-gray-900 font-mono">@{actor}</span>
                              <span className="text-xs font-bold text-gray-400 font-mono">{role}</span>
                              <span
                                className={`ml-1.5 px-2 py-0.5 font-mono rounded text-[10px] uppercase font-bold ${
                                  log.action_type?.includes('PAID') || log.action_type?.includes('SALE')
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : log.action_type?.includes('VOID') || log.action_type?.includes('DELETE')
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {log.action_type}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">{formattedTime}</span>
                          </div>
                          
                          {/* Display original creator if this is a void action and creator is different from actor */}
                          {log.action_type?.includes('VOID') && creator && creator !== actor && (
                            <div className="text-[10px] text-gray-400 font-medium">
                              Original Order Creator: @{creator}
                            </div>
                          )}

                          {target && (
                            <div className="text-[11px] font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 font-mono w-fit mt-0.5">
                              🎯 Target: {target}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
            <h3 className="font-black text-gray-900 text-lg mb-1">Provision Individual Account</h3>
            <p className="text-xs text-gray-400 mb-6">Create dedicated credentials to ensure clean tracking.</p>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider block mb-1.5">
                  Username / Handler
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., m.jones"
                  value={newStaff.username}
                  onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider block mb-1.5">
                  Temporary Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider block mb-1.5">
                  Assigned Station Clearance
                </label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-gray-700"
                >
                  <option value="counter">Counter Staff Desk</option>
                  <option value="cashier">Cashier Desk</option>
                  <option value="inventory">Inventory Controller</option>
                  <option value="owner">Administrative Co-Owner</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
              >
                {isSubmitting ? 'Deploying Access keys...' : '🚀 Provision Staff Profile'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
            <h3 className="font-black text-gray-900 text-lg mb-1">Active Staff Directory</h3>
            <p className="text-xs text-gray-400 mb-6">Real-time system logins currently authorized.</p>

            <div className="overflow-x-auto border border-gray-200/70 rounded-xl">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 font-bold text-gray-400 uppercase text-xs tracking-wider">
                  <tr>
                    <th className="px-6 py-4 text-left">Active User</th>
                    <th className="px-6 py-4 text-left">Role Clearance</th>
                    <th className="px-6 py-4 text-center">Security Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700 font-medium">
                  {staffList.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center text-gray-400 italic">
                        No team profiles connected. Try refreshing the view.
                      </td>
                    </tr>
                  ) : (
                    staffList.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>👤</span> {user.username}
                            {user.must_change_password && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-200 uppercase font-mono">
                                Temp Password
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-black uppercase tracking-wider ${
                              user.role === 'owner'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : user.role === 'inventory'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : user.role === 'cashier'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center flex justify-center gap-2">
                          <button
                            onClick={() => openResetModal(user.id, user.username)}
                            className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <span>🔑</span> Reset
                          </button>
                          {user.username !== 'admin' && (
                            <button
                              onClick={() => handleDeleteStaff(user.id, user.username)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            >
                              Revoke Access
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {resetModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <span>🔑</span> Reset Staff Password
              </h3>
              <button
                onClick={() => setResetModal({ ...resetModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Assign a temporary password for <strong className="text-gray-800">@{resetModal.username}</strong>.
            </p>

            <form onSubmit={handleConfirmResetPassword} className="space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-wider block mb-1.5">
                  Temporary Password
                </label>
                <input
                  type="text"
                  required
                  value={resetModal.tempPassword}
                  onChange={(e) => setResetModal({ ...resetModal, tempPassword: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModal({ ...resetModal, isOpen: false })}
                  className="w-1/2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-xs"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
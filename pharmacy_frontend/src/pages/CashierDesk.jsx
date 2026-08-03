import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { db } from '../db/indexedDB';
import { formatCurrency } from '../utils/formatters';

const getSyncQueue = () => JSON.parse(localStorage.getItem('pos_pending_sync_queue') || '[]');
const saveSyncQueue = (queue) => localStorage.setItem('pos_pending_sync_queue', JSON.stringify(queue));

function CashierDesk({ orders = [], fetchOrders, isNetworkOnline }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [localOrdersList, setLocalOrdersList] = useState([]);

  // Merge server orders + Dexie offline orders into one unified list
  const loadOrders = useCallback(async () => {
    if (isNetworkOnline && orders.length > 0) {
      // Online: use server orders as source of truth
      // Also pull any unsynced offline orders not yet on the server
      const offlineOrders = await db.offlineOrders.where('synced').equals(0).toArray();
      const offlineMapped = offlineOrders.map((o) => ({
        ...o,
        id: `OFFLINE-${o.tempId}`,
        _offlineTempId: o.tempId
      }));
      const serverIds = new Set(orders.map((o) => String(o.id)));
      const uniqueOffline = offlineMapped.filter((o) => !serverIds.has(String(o.id)));
      setLocalOrdersList([...orders, ...uniqueOffline]);
    } else {
      // Offline: read entirely from Dexie
      const offlineOrders = await db.offlineOrders.where('synced').equals(0).toArray();
      const mapped = offlineOrders.map((o) => ({
        ...o,
        id: `OFFLINE-${o.tempId}`,
        _offlineTempId: o.tempId
      }));
      setLocalOrdersList(mapped);
    }
  }, [isNetworkOnline, orders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Flush queued offline status updates when back online
  useEffect(() => {
    if (!isNetworkOnline) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    (async () => {
      const remaining = [];
      for (const item of queue) {
        try {
          await api.patch(`/orders/${item.orderId}`, { order: { status: item.status } });
        } catch {
          remaining.push(item);
        }
      }
      saveSyncQueue(remaining);
      if (fetchOrders) fetchOrders();
    })();
  }, [isNetworkOnline]);

  const pendingOrders = localOrdersList.filter(
    (o) => o.status === 'pending' || o.status === 'draft'
  );

  const currentSelectedPreview = selectedOrder
    ? localOrdersList.find((o) => String(o.id) === String(selectedOrder.id))
    : null;

  const updateOrderStatus = async (order, targetStatus, successMsg) => {
    const orderId = order.id;
    const offlineTempId = order._offlineTempId;

    // Optimistic UI
    setLocalOrdersList((prev) =>
      prev.map((o) => String(o.id) === String(orderId) ? { ...o, status: targetStatus } : o)
    );
    setSelectedOrder(null);

    if (isNetworkOnline && !offlineTempId) {
      // Server order while online
      try {
        await api.patch(`/orders/${orderId}`, { order: { status: targetStatus } });
        alert(`${successMsg} (Synced)`);
        if (fetchOrders) fetchOrders();
      } catch (err) {
        console.warn('Patch failed, queueing:', err);
        const q = getSyncQueue();
        q.push({ orderId, status: targetStatus, timestamp: new Date().toISOString() });
        saveSyncQueue(q);
        alert(`${successMsg} (Queued for sync)`);
      }
    } else if (offlineTempId) {
      // Offline-created order — update Dexie record
      await db.offlineOrders.update(offlineTempId, { status: targetStatus });

      if (isNetworkOnline) {
        // Try to sync now
        try {
          const record = await db.offlineOrders.get(offlineTempId);
          await api.post('/orders', record.raw_payload || record);
          await db.offlineOrders.delete(offlineTempId);
          alert(`${successMsg} (Synced)`);
          if (fetchOrders) fetchOrders();
        } catch {
          alert(`${successMsg} (Saved locally — will sync later)`);
        }
      } else {
        alert(`${successMsg} (Saved offline)`);
      }
    } else {
      // Server order while offline — queue
      const q = getSyncQueue();
      q.push({ orderId, status: targetStatus, timestamp: new Date().toISOString() });
      saveSyncQueue(q);
      alert(`${successMsg} (Saved offline — will sync when online)`);
    }

    await loadOrders();
  };

  const handlePayment = (order) => {
    updateOrderStatus(order, 'paid', `Order #${order.id} marked as PAID!`);
  };

  const handleVoidOrder = (order) => {
    const confirmed = window.confirm(
      `Are you sure you want to VOID Order #${order.id}? This creates an audit log entry.`
    );
    if (!confirmed) return;
    updateOrderStatus(order, 'cancelled', `Order #${order.id} successfully VOIDED.`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* LEFT: Queue */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Cashier Queue</h2>
          <span className={`text-xs font-bold px-2 py-1 rounded-md border ${
            isNetworkOnline
              ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {isNetworkOnline ? 'Live Stream Connected' : 'Offline Mode Active'}
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No pending tickets waiting at the desk.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  String(selectedOrder?.id) === String(order.id)
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800">Ticket #{order.id}</span>
                  <div className="flex items-center gap-1">
                    {order._offlineTempId && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">OFFLINE</span>
                    )}
                    <span className="text-xs bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full capitalize">
                      {order.status}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Items: {order.order_items?.length || 0}</span>
                  <span className="font-semibold text-gray-700">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: Selected ticket */}
      <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col justify-between">
        {currentSelectedPreview ? (
          <>
            <div>
              <div className="flex justify-between items-start border-b pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-800">Review Order #{currentSelectedPreview.id}</h2>
                  <p className="text-sm text-gray-500">Verify medication quantities prior to billing confirmation.</p>
                  {currentSelectedPreview._offlineTempId && !isNetworkOnline && (
                    <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded">
                      ⚠️ Offline Order — payment will sync when online
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleVoidOrder(currentSelectedPreview)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-md text-sm font-semibold border border-red-200 transition-colors cursor-pointer"
                >
                  Void/Cancel Ticket
                </button>
              </div>

              <div className="mb-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b text-gray-400 text-xs uppercase tracking-wider">
                      <th className="pb-2">Medication</th>
                      <th className="pb-2">Qty Requested</th>
                      <th className="pb-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSelectedPreview.order_items?.map((item, idx) => (
                      <tr key={item.id || idx} className="border-b hover:bg-gray-50/50">
                        <td className="py-3 font-medium text-gray-800">
                          {item.medicine?.name || `Medicine #${item.medicine_id}`}
                        </td>
                        <td className="py-3 text-gray-600">{item.quantity} units</td>
                        <td className="py-3 text-right font-semibold text-gray-700">
                          {formatCurrency(item.price_at_sale || item.price || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-center sm:text-left">
                <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Total Amount Due</span>
                <span className="text-3xl font-black text-gray-900">
                  {formatCurrency(currentSelectedPreview.total_amount)}
                </span>
              </div>
              <button
                onClick={() => handlePayment(currentSelectedPreview)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold tracking-wide shadow-md transition-colors cursor-pointer"
              >
                Accept Payment & Close Invoice
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
              className="w-16 h-16 mb-4 text-gray-400 opacity-50 fill-none stroke-current stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p className="font-medium text-base">Select a ticket from the left queue sheet to view invoice properties.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CashierDesk;
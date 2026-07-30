import React, { useState, useEffect } from 'react';
import api from '../api';
import { formatCurrency } from '../utils/formatters';


const STORAGE_KEYS = {
  OFFLINE_ORDERS: 'pos_offline_orders',
  PENDING_SYNC: 'pos_pending_sync_queue'
};

const getLocalOrders = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_ORDERS) || '[]');
const saveLocalOrders = (orders) => localStorage.setItem(STORAGE_KEYS.OFFLINE_ORDERS, JSON.stringify(orders));

const getSyncQueue = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_SYNC) || '[]');
const saveSyncQueue = (queue) => localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(queue));

function CashierDesk({ orders = [], fetchOrders }) {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [localOrdersList, setLocalOrdersList] = useState([]);

  // Monitor Network Connectivity & Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processPendingSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync props.orders with local state
  useEffect(() => {
    if (orders.length > 0) {
      setLocalOrdersList(orders);
      saveLocalOrders(orders);
    } else {
      const cached = getLocalOrders();
      if (cached.length > 0) setLocalOrdersList(cached);
    }
  }, [orders]);

  // Flush queued offline transactions to backend when online
  const processPendingSyncQueue = async () => {
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    const remainingQueue = [];
    for (const item of queue) {
      try {
        await axios.patch(`${API_BASE_URL}/orders/${item.orderId}`, {
          order: { status: item.status }
        });
      } catch (err) {
        console.error(`Failed to sync queued order #${item.orderId}`, err);
        remainingQueue.push(item);
      }
    }

    saveSyncQueue(remainingQueue);
    if (fetchOrders) fetchOrders();
  };

  // Live Queue Filtering
  const pendingOrders = localOrdersList.filter(
    (order) => order.status === 'pending' || order.status === 'draft'
  );

  const currentSelectedPreview = selectedOrder 
    ? localOrdersList.find(o => o.id === selectedOrder.id) 
    : null;

  const queueOfflineAction = (orderId, status) => {
    const currentQueue = getSyncQueue();
    currentQueue.push({ orderId, status, timestamp: new Date().toISOString() });
    saveSyncQueue(currentQueue);
  };

  const updateOrderStatus = async (orderId, targetStatus, successMsg) => {
    // 1. Optimistic UI update locally
    const updatedList = localOrdersList.map((o) =>
      o.id === orderId ? { ...o, status: targetStatus } : o
    );
    setLocalOrdersList(updatedList);
    saveLocalOrders(updatedList);
    setSelectedOrder(null);

    // 2. Try pushing to server if online
    if (navigator.onLine) {
      try {
        await axios.patch(`${API_BASE_URL}/orders/${orderId}`, {
          order: { status: targetStatus }
        });
        alert(`${successMsg} (Synced to Server)`);
        if (fetchOrders) fetchOrders();
      } catch (error) {
        console.warn('Network request failed. Queueing action offline...', error);
        queueOfflineAction(orderId, targetStatus);
        alert(`${successMsg} (Saved Locally - Will Sync When Online)`);
      }
    } else {
      // 3. Queue offline action if strictly offline
      queueOfflineAction(orderId, targetStatus);
      alert(`${successMsg} (Saved Offline)`);
    }
  };

  const handlePayment = (orderId) => {
    updateOrderStatus(orderId, 'paid', `Order #${orderId} marked as PAID!`);
  };

  const handleVoidOrder = (orderId) => {
    const confirmVoid = window.confirm(
      `Are you sure you want to VOID Order #${orderId}? This creates an audit log entry.`
    );
    if (!confirmVoid) return;

    updateOrderStatus(orderId, 'cancelled', `Order #${orderId} successfully VOIDED.`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* LEFT COLUMN: Queue of Unpaid Tickets */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Cashier Queue</h2>
          <span className={`text-xs font-bold px-2 py-1 rounded-md border ${
            isOnline 
              ? 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse' 
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {isOnline ? 'Live Stream Connected' : 'Offline Mode Active'}
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
                  selectedOrder?.id === order.id 
                    ? 'border-blue-500 bg-blue-50/50' 
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800">Ticket #{order.id}</span>
                  <span className="text-xs bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full capitalize">
                    {order.status}
                  </span>
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

      {/* CENTER & RIGHT COLUMNS: Selected Ticket Checkout Review */}
      <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col justify-between">
        {currentSelectedPreview ? (
          <>
            <div>
              <div className="flex justify-between items-start border-b pb-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-800">Review Order #{currentSelectedPreview.id}</h2>
                  <p className="text-sm text-gray-500">Verify medication quantities prior to billing confirmation.</p>
                </div>
                <button 
                  onClick={() => handleVoidOrder(currentSelectedPreview.id)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-md text-sm font-semibold border border-red-200 transition-colors cursor-pointer"
                >
                  Void/Cancel Ticket
                </button>
              </div>

              {/* Items Table */}
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
                    {currentSelectedPreview.order_items?.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50/50">
                        <td className="py-3 font-medium text-gray-800">
                          {item.medicine?.name || `Medicine Reference ID: ${item.medicine_id}`}
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

            {/* Bottom Checkout Actions */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-center sm:text-left">
                <span className="text-xs text-gray-400 block uppercase font-bold tracking-wider">Total Amount Due</span>
                <span className="text-3xl font-black text-gray-900">
                  {formatCurrency(currentSelectedPreview.total_amount)}
                </span>
              </div>
              <button
                onClick={() => handlePayment(currentSelectedPreview.id)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold tracking-wide shadow-md transition-colors cursor-pointer"
              >
                Accept Payment & Close Invoice
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              className="w-16 h-16 mb-4 text-gray-400 opacity-50 fill-none stroke-current stroke-2"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" 
              />
            </svg>
            <p className="font-medium text-base">Select a ticket from the left queue sheet to view invoice properties.</p>
          </div>
        )}
      </div>

    </div>
  );
}

export default CashierDesk;
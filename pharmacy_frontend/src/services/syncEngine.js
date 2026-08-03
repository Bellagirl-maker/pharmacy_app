import api from '../api';
import { db, deductLocalStock } from '../db/indexedDB';

export const syncEngine = {
  isOnline: () => navigator.onLine,

  // Submit order — online or offline
  submitOrder: async (orderPayload) => {
    if (navigator.onLine) {
      try {
        const response = await api.post('/orders', orderPayload);
        return { success: true, offline: false, data: response.data };
      } catch (err) {
        if (err.response && err.response.status === 400) {
          const errorMessage = err.response.data?.error || 'Validation error from server.';
          throw new Error(errorMessage);
        }
        console.warn('Server unreachable. Falling back to offline queueing.', err);
      }
    }

    // --- OFFLINE PATH ---
    const items = orderPayload.items || [];
    const totalAmount = orderPayload.order?.total_amount || 0;

    // Build order_items in the same shape CashierDesk expects so it can
    // display offline orders without any extra transformation.
    const orderItems = items.map((item) => ({
      medicine_id: item.medicine_id,
      medicine: { name: item.name || `Medicine #${item.medicine_id}` },
      quantity: item.quantity,
      price_at_sale: item.price_at_sale ?? item.price ?? 0
    }));

    const offlineRecord = {
      status: 'pending',
      total_amount: totalAmount,
      order_items: orderItems,   // display-ready shape for CashierDesk
      raw_payload: orderPayload, // original payload kept for sync
      created_at: new Date().toISOString(),
      offline_created: true,
      synced: 0
    };

    const tempId = await db.offlineOrders.add(offlineRecord);

    // Immediately deduct from local medicine cache so Counter Desk
    // stock levels update without waiting for the server.
    await deductLocalStock(items);

    return {
      success: true,
      offline: true,
      data: { ...offlineRecord, id: `OFFLINE-${tempId}`, tempId }
    };
  },

  // Flush queued offline orders to backend when reconnected
  flushOfflineQueue: async () => {
    if (!navigator.onLine) return;

    const pendingOrders = await db.offlineOrders.where('synced').equals(0).toArray();
    if (pendingOrders.length === 0) return;

    console.log(`📡 Reconnected! Syncing ${pendingOrders.length} offline orders...`);

    for (const order of pendingOrders) {
      try {
        // Use the original raw payload for the API call
        const payload = order.raw_payload || order;
        const { tempId, synced, offline_created, raw_payload, order_items, ...cleanPayload } = payload;

        await api.post('/orders', order.raw_payload || cleanPayload);
        await db.offlineOrders.delete(order.tempId);
        console.log(`✅ Synced offline order #${order.tempId}`);
      } catch (err) {
        if (err.response && err.response.status === 400) {
          console.error(
            `❌ Permanent sync failure for order #${order.tempId}: ${err.response.data?.error}. Removing from queue.`
          );
          await db.offlineOrders.delete(order.tempId);
        } else {
          console.error(`⚠️ Temporary network error for order #${order.tempId}. Will retry later.`, err);
        }
      }
    }
  }
};
import api from '../api';
import { db, deductLocalStock } from '../db/indexedDB';

export const syncEngine = {
  isOnline: () => navigator.onLine,

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

    // Capture who is creating this order RIGHT NOW so attribution
    // is correct when the order syncs later (even if a different
    // user is logged in at sync time).
    const creatorManagerId = localStorage.getItem('manager_id');

    const orderItems = items.map((item) => ({
      medicine_id: item.medicine_id,
      medicine: { name: item.name || `Medicine #${item.medicine_id}` },
      quantity: item.quantity,
      price_at_sale: item.price_at_sale ?? item.price ?? 0
    }));

    const offlineRecord = {
      status: 'pending',
      total_amount: totalAmount,
      order_items: orderItems,
      creator_manager_id: creatorManagerId, // preserved for correct attribution on sync
      raw_payload: orderPayload,
      created_at: new Date().toISOString(),
      offline_created: true,
      synced: 0
    };

    const tempId = await db.offlineOrders.add(offlineRecord);

    // Immediately deduct from local medicine cache
    await deductLocalStock(items);

    return {
      success: true,
      offline: true,
      data: { ...offlineRecord, id: `OFFLINE-${tempId}`, tempId }
    };
  },

  flushOfflineQueue: async () => {
    if (!navigator.onLine) return;

    const pendingOrders = await db.offlineOrders.where('synced').equals(0).toArray();
    if (pendingOrders.length === 0) return;

    console.log(`📡 Reconnected! Syncing ${pendingOrders.length} offline orders...`);

    for (const order of pendingOrders) {
      try {
        // Use the original creator's manager ID for correct attribution,
        // not whoever happens to be logged in at sync time.
        const syncHeaders = order.creator_manager_id
          ? { 'X-Manager-Id': order.creator_manager_id }
          : {};

        await api.post('/orders', order.raw_payload || order, {
          headers: syncHeaders
        });

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
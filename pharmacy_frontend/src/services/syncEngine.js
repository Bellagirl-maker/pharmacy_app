import axios from 'axios';
import { db } from '../db/indexedDB';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const syncEngine = {
  // Check browser online status
  isOnline: () => navigator.onLine,

  // Submit order handling both online and offline routes
  submitOrder: async (orderPayload) => {
    if (navigator.onLine) {
      try {
        const response = await axios.post(`${API_BASE_URL}/orders`, orderPayload);
        return { success: true, offline: false, data: response.data };
      } catch (err) {
        // If the server responded with 400 (e.g. Out of Stock), DO NOT queue offline.
        // Throw the error so CounterDesk can display the stock error to the user!
        if (err.response && err.response.status === 400) {
          const errorMessage = err.response.data?.error || 'Validation error from server.';
          throw new Error(errorMessage);
        }

        // Only fall back to offline storage if it's a genuine network/server unreachable error
        console.warn('Server unreachable. Falling back to offline queueing.', err);
      }
    }

    // Process Offline Order Queue (When network is disconnected or server is down)
    const offlineRecord = {
      ...orderPayload,
      status: 'pending',
      created_at: new Date().toISOString(),
      offline_created: true,
      synced: 0 // 0 = unsynced, 1 = synced
    };

    const tempId = await db.offlineOrders.add(offlineRecord);
    return {
      success: true,
      offline: true,
      data: { ...offlineRecord, id: `OFFLINE-${tempId}` }
    };
  },

  // Flush Queued Offline Orders to Backend
  flushOfflineQueue: async () => {
    if (!navigator.onLine) return;

    const pendingOrders = await db.offlineOrders.where('synced').equals(0).toArray();

    if (pendingOrders.length === 0) return;

    console.log(`📡 Reconnected! Syncing ${pendingOrders.length} offline orders...`);

    for (const order of pendingOrders) {
      try {
        // Strip temp IndexedDB keys before pushing to Rails backend
        const { tempId, synced, offline_created, ...payload } = order;

        await axios.post(`${API_BASE_URL}/orders`, payload);

        // Remove successfully synced item from IndexedDB
        await db.offlineOrders.delete(order.tempId);
        console.log(`✅ Synced offline order #${order.tempId}`);
      } catch (err) {
        // If backend explicitly rejects queued order due to stock or validation (400)
        if (err.response && err.response.status === 400) {
          console.error(
            `❌ Permanent sync failure for order #${order.tempId}: ${err.response.data?.error}. Removing invalid ticket from queue.`
          );
          // Delete from queue so it stops clogging the background sync engine
          await db.offlineOrders.delete(order.tempId);
        } else {
          console.error(`⚠️ Temporary network error syncing order #${order.tempId}. Will retry later.`, err);
        }
      }
    }
  }
};
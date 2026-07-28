import Dexie from 'dexie';

export const db = new Dexie('RxLocalPharmacyDB');

// Define schema version and stores
db.version(1).stores({
  medicines: 'id, name, barcode, price, stock', // Local inventory cache
  offlineOrders: '++tempId, id, status, created_at, synced', // Pending order sync queue
  offlineLogs: '++id, event, timestamp, synced' // Offline audit trail
});

// Helper to seed or update inventory cache from Rails
export const cacheMedicinesLocally = async (medicinesList) => {
  if (!Array.isArray(medicinesList)) return;
  await db.medicines.bulkPut(medicinesList);
};

// Helper to grab medicines offline
export const getLocalMedicines = async () => {
  return await db.medicines.toArray();
};
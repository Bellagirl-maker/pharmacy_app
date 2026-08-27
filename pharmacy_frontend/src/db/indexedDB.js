import Dexie from 'dexie';

export const db = new Dexie('RxLocalPharmacyDB');

db.version(1).stores({
  medicines: 'id, name, barcode, price, stock',
  offlineOrders: '++tempId, id, status, created_at, synced',
  offlineLogs: '++id, event, timestamp, synced'
});

// Helper to seed or update inventory cache from Rails
export const cacheMedicinesLocally = async (medicinesList) => {
  if (!Array.isArray(medicinesList)) return;
  
  // Clear the entire table first, then repopulate with fresh data
  // This ensures deleted medicines don't linger in the offline cache
  await db.medicines.clear();
  await db.medicines.bulkPut(medicinesList);
};

// Helper to grab medicines offline
export const getLocalMedicines = async () => {
  return await db.medicines.toArray();
};

// Helper to deduct stock locally when an order is created offline
// items = [{medicine_id, quantity}]
export const deductLocalStock = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    const medicine = await db.medicines.get(item.medicine_id);
    if (!medicine) continue;

    const currentStock =
      medicine.total_stock ?? medicine.stock_level ?? medicine.stock ?? 0;

    const newStock = Math.max(0, currentStock - item.quantity);

    await db.medicines.update(item.medicine_id, {
      total_stock: newStock,
      stock_level: newStock,
      stock: newStock
    });
  }
};
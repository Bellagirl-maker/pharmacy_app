import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatCurrency } from '../utils/formatters';
import InventoryBulkImport from '../components/InventoryBulkImport';
import { db } from '../db/indexedDB'; // Dexie/IndexedDB instance

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export default function InventoryDesk() {
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingBatchId, setDeletingBatchId] = useState(null);
  const [deletingMedicineId, setDeletingMedicineId] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Toggle bulk import modal panel
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounce search term changes
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // Track network connectivity state
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- FETCH INVENTORY (HYBRID OFFLINE/ONLINE) ---
  const fetchInventory = async () => {
    setIsLoading(true);

    // 1. Try Online API Request
    if (navigator.onLine) {
      try {
        const response = await axios.get(`${API_BASE_URL}/medicines?search=${encodeURIComponent(debouncedSearch)}`);
        const remoteData = response.data || [];
        
        setInventory(remoteData);
        setIsOffline(false);

        // Populate/Sync remote data into local Dexie cache when non-empty
        if (remoteData.length > 0 && !debouncedSearch) {
          await db.medicines.clear();
          await db.medicines.bulkPut(remoteData);
        }
        setIsLoading(false);
        return;
      } catch (err) {
        console.warn('Network request failed. Falling back to local IndexedDB store:', err);
      }
    }

    // 2. Offline Fallback (Read from IndexedDB)
    setIsOffline(true);
    try {
      const localMedicines = await db.medicines.toArray();
      
      if (!debouncedSearch.trim()) {
        setInventory(localMedicines);
      } else {
        const query = debouncedSearch.toLowerCase();
        const filtered = localMedicines.filter((med) =>
          med.name?.toLowerCase().includes(query)
        );
        setInventory(filtered);
      }
    } catch (dbErr) {
      console.error('Failed to query local IndexedDB medicines store:', dbErr);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [debouncedSearch, isOffline]);

  // --- DELETE ENTIRE MEDICINE HANDLER ---
  const handleDeleteMedicine = async (medicineId, medicineName) => {
    const isConfirmed = window.confirm(
      `Are you sure you want to completely remove "${medicineName}" from the system?\n\nThis will remove it from both Inventory Desk and Counter Desk.`
    );

    if (!isConfirmed) return;

    setDeletingMedicineId(medicineId);

    // Online execution
    if (navigator.onLine) {
      try {
        await axios.delete(`${API_BASE_URL}/medicines/${medicineId}`);
        // Also remove from local store
        await db.medicines.delete(medicineId);
        await fetchInventory();
        return;
      } catch (err) {
        console.error('Failed to delete medicine online:', err);
        alert('Failed to delete medicine on server.');
      } finally {
        setDeletingMedicineId(null);
      }
    } else {
      // Offline execution
      try {
        await db.medicines.delete(medicineId);
        await fetchInventory();
      } catch (err) {
        console.error('Failed to delete medicine locally:', err);
      } finally {
        setDeletingMedicineId(null);
      }
    }
  };

  // --- DELETE INDIVIDUAL BATCH HANDLER ---
  const handleDeleteBatch = async (medicineId, batchId, batchNumber) => {
    if (!batchId) {
      alert("Cannot delete batch: Missing Batch ID from API response.");
      return;
    }

    const isConfirmed = window.confirm(
      `Are you sure you want to remove batch "${batchNumber}"?`
    );

    if (!isConfirmed) return;

    setDeletingBatchId(batchId);

    // Helper to purge batch locally from Dexie cache
    const removeBatchLocally = async () => {
      const med = await db.medicines.get(medicineId);
      if (med && med.batches) {
        const updatedBatches = med.batches.filter(
          (b) => (b.id || b.batch_id) !== batchId
        );
        await db.medicines.update(medicineId, { batches: updatedBatches });
      }
    };

    if (navigator.onLine) {
      try {
        await axios.delete(`${API_BASE_URL}/batches/${batchId}`);
        await removeBatchLocally();
        await fetchInventory();
      } catch (err) {
        console.error('Failed to delete batch online:', err);
        alert('Failed to delete batch from server.');
      } finally {
        setDeletingBatchId(null);
      }
    } else {
      try {
        await removeBatchLocally();
        await fetchInventory();
      } catch (err) {
        console.error('Failed to remove batch locally:', err);
      } finally {
        setDeletingBatchId(null);
      }
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            📦 Inventory Control Desk
            {isOffline && (
              <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full border border-amber-300">
                Offline Mode (IndexedDB)
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">Track pharmaceutical stock levels, batch lots, and supply chains.</p>
        </div>
        
        <button
          onClick={() => setShowImportModal(true)}
          disabled={isOffline}
          className={`px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${
            isOffline 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          title={isOffline ? 'Batch import requires an active internet connection' : 'Import bulk inventory'}
        >
          <span>Mass CSV Import</span>
          <span>📊</span>
        </button>
      </div>

      {/* SEARCH CONTROL */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Search database by generic or brand name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2.5 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* INVENTORY TABLE PANEL */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading && inventory.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400 font-medium">
            Querying active stock database...
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 font-bold uppercase border-b">
                <th className="p-4">Item Description</th>
                <th className="p-4">Unit Selling Price</th>
                <th className="p-4">Active Batches</th>
                <th className="p-4 text-right">Total Available Stock</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((med) => {
                const totalStock = med.batches?.reduce((sum, b) => sum + (b.quantity || 0), 0) ?? med.total_stock ?? 0;

                return (
                  <tr key={med.id} className="border-b hover:bg-gray-50/50 transition-colors">
                    {/* MEDICINE NAME & ITEM DELETE ACTION */}
                    <td className="p-4">
                      <div className="flex items-center justify-between group/med pr-4">
                        <div>
                          <span className="font-bold text-gray-800 block">{med.name}</span>
                          <span className="text-xs text-gray-400 block">ID Reference: #{med.id}</span>
                        </div>
                        
                        {/* Delete Medicine Record Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteMedicine(med.id, med.name)}
                          disabled={deletingMedicineId === med.id}
                          title="Permanently remove this medicine from system"
                          className="text-xs font-semibold px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all opacity-80 group-hover/med:opacity-100"
                        >
                          {deletingMedicineId === med.id ? 'Deleting...' : 'Delete Item'}
                        </button>
                      </div>
                    </td>

                    {/* UNIT SELLING PRICE */}
                    <td className="p-4 text-sm font-semibold text-gray-700">
                      {formatCurrency(med.price || 0)}
                    </td>
                    
                    {/* BATCH LOT PILLS WITH TRASH DELETE BUTTON */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {med.batches?.map((b) => {
                          const targetBatchId = b.id || b.batch_id;

                          return (
                            <span
                              key={targetBatchId || b.batch_number}
                              className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200/80 border border-gray-200 text-gray-700 text-[11px] font-semibold px-2 py-0.5 rounded transition-all group"
                            >
                              <span>
                                {b.batch_number} ({b.quantity}u)
                              </span>
                              
                              {/* Trash Button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(med.id, targetBatchId, b.batch_number)}
                                disabled={deletingBatchId === targetBatchId}
                                title="Delete this batch lot"
                                className="text-gray-400 hover:text-red-600 focus:outline-none ml-0.5 transition-colors"
                              >
                                {deletingBatchId === targetBatchId ? (
                                  <span className="text-[9px] animate-pulse">...</span>
                                ) : (
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                )}
                              </button>
                            </span>
                          );
                        })}

                        {(!med.batches || med.batches.length === 0) && (
                          <span className="text-xs text-red-500 font-medium italic">
                            No Active Lots
                          </span>
                        )}
                      </div>
                    </td>

                    {/* COMPUTED TOTAL STOCK */}
                    <td className="p-4 text-right font-black text-sm text-gray-700">
                      {totalStock} units
                    </td>
                  </tr>
                );
              })}

              {inventory.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center p-8 text-sm text-gray-400">
                    No matching medicines found in inventory database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* POP-UP BULK IMPORT MODAL INTERFACE */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl border max-w-xl w-full p-6 relative">
            <button 
              onClick={() => {
                setShowImportModal(false);
                fetchInventory();
              }} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold"
            >
              ✕
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-black text-gray-900">Spreadsheet Batch Processing</h3>
              <p className="text-xs text-gray-500">Select or drop your formatted pharmacy CSV template spreadsheet below.</p>
            </div>

            <InventoryBulkImport onImportSuccess={() => {
              setShowImportModal(false);
              fetchInventory();
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
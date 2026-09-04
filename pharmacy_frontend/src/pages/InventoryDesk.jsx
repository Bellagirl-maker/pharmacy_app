import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { db } from '../db/indexedDB';
import InventoryBulkImport from '../components/InventoryBulkImport';

const BASE_UNITS = ['tablet', 'strip', 'bottle', 'sachet', 'vial', 'box', 'tube', 'injection', 'cream', 'capsule'];
const EMPTY_FORM = { name: '', price: '', unit: 'tablet', shelf_location: '' };
const EMPTY_UNIT = { unit_name: '', price: '', quantity_in_base_units: 1, is_default: false };

export default function InventoryDesk({ isNetworkOnline }) {
  const [medicines, setMedicines]             = useState([]);
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading]             = useState(true);
  const [showImport, setShowImport]           = useState(false);

  // Add / Edit medicine form
  const [showForm, setShowForm]               = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [form, setForm]                       = useState(EMPTY_FORM);
  const [formError, setFormError]             = useState(null);
  const [formLoading, setFormLoading]         = useState(false);
  const [savedMedicineId, setSavedMedicineId] = useState(null);

  // Selling units management
  const [sellingUnits, setSellingUnits]       = useState([]);
  const [newUnit, setNewUnit]                 = useState(EMPTY_UNIT);
  const [unitError, setUnitError]             = useState(null);
  const [unitLoading, setUnitLoading]         = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMedicines = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isNetworkOnline) {
        const res = await api.get(`/medicines?search=${encodeURIComponent(debouncedSearch)}`);
        setMedicines(res.data || []);
      } else {
        const local = await db.medicines.toArray();
        const filtered = debouncedSearch
          ? local.filter(m => m.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
          : local;
        setMedicines(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch medicines:', err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, isNetworkOnline]);

  useEffect(() => { fetchMedicines(); }, [fetchMedicines]);

  const openAddForm = () => {
    setEditingMedicine(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSavedMedicineId(null);
    setSellingUnits([]);
    setNewUnit(EMPTY_UNIT);
    setShowForm(true);
  };

  const openEditForm = (medicine) => {
    setEditingMedicine(medicine);
    setForm({
      name:           medicine.name || '',
      price:          medicine.price || '',
      unit:           medicine.unit || 'tablet',
      shelf_location: medicine.shelf_location || '',
    });
    setFormError(null);
    setSavedMedicineId(medicine.id);
    setSellingUnits(medicine.medicine_units || []);
    setNewUnit(EMPTY_UNIT);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingMedicine(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSavedMedicineId(null);
    setSellingUnits([]);
    setNewUnit(EMPTY_UNIT);
    fetchMedicines();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      let res;
      if (editingMedicine) {
        res = await api.patch(`/medicines/${editingMedicine.id}`, { medicine: form });
      } else {
        res = await api.post('/medicines', { medicine: form });
      }
      setSavedMedicineId(res.data.id);
      setSellingUnits(res.data.medicine_units || []);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save medicine.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddUnit = async () => {
    if (!savedMedicineId) return;
    if (!newUnit.unit_name || !newUnit.price || !newUnit.quantity_in_base_units) {
      setUnitError('Please fill in all unit fields.');
      return;
    }
    setUnitError(null);
    setUnitLoading(true);
    try {
      const res = await api.post(`/medicines/${savedMedicineId}/units`, {
        medicine_unit: newUnit
      });
      setSellingUnits(prev => [...prev, res.data]);
      setNewUnit(EMPTY_UNIT);
    } catch (err) {
      setUnitError(err.response?.data?.error || 'Failed to add unit.');
    } finally {
      setUnitLoading(false);
    }
  };

  const handleDeleteUnit = async (unitId) => {
    if (!savedMedicineId) return;
    try {
      await api.delete(`/medicines/${savedMedicineId}/units/${unitId}`);
      setSellingUnits(prev => prev.filter(u => u.id !== unitId));
    } catch (err) {
      setUnitError(err.response?.data?.error || 'Failed to delete unit.');
    }
  };

  const handleDelete = async (medicineId, medicineName) => {
    if (!window.confirm(`Are you sure you want to delete ${medicineName} and all its batches?`)) return;
    try {
      await api.delete(`/medicines/${medicineId}`);
      fetchMedicines();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete medicine.');
    }
  };

  const totalStock = (medicine) => {
    if (!medicine.batches || medicine.batches.length === 0) return 0;
    const today = new Date();
    return medicine.batches
      .filter(b => new Date(b.expiry_date) > today)
      .reduce((sum, b) => sum + (b.quantity || 0), 0);
  };

  const stockColor = (qty) => {
    if (qty === 0) return '#ef4444';
    if (qty <= 20) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-black text-gray-800">Inventory Control Desk</h2>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            isNetworkOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {isNetworkOnline ? 'Live' : 'Offline Mode (IndexedDB)'}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddForm}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold px-4 py-2 rounded-lg transition-all">
            + Add Medicine
          </button>
          <button onClick={() => setShowImport(v => !v)}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg border border-gray-200 transition-all">
            📊 Mass CSV Import
          </button>
          <button onClick={fetchMedicines}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-blue-600 text-sm font-bold px-4 py-2 rounded-lg border border-blue-200 transition-all">
            🔄 Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">Track pharmaceutical stock levels, batch lots, and supply chains.</p>

      {/* Bulk Import */}
      {showImport && (
        <div className="mb-6">
          <InventoryBulkImport onImportComplete={() => { setShowImport(false); fetchMedicines(); }} />
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-black text-gray-900">
                {editingMedicine ? `Edit ${editingMedicine.name}` : 'Add New Medicine'}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>

            {/* SECTION 1: Basic Info */}
            <div className="mb-6">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                1. Basic Information
              </p>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Medicine Name *
                  </label>
                  <input
                    type="text" required
                    placeholder="e.g. Paracetamol 500mg"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                      Base Price (GH₵) *
                    </label>
                    <input
                      type="number" required min="0" step="0.01"
                      placeholder="0.00"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                      Base Unit *
                    </label>
                    <select
                      value={form.unit}
                      onChange={e => setForm({ ...form, unit: e.target.value })}
                      className="w-full p-3 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {BASE_UNITS.map(u => (
                        <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Shelf Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aisle 2, Shelf B"
                    value={form.shelf_location}
                    onChange={e => setForm({ ...form, shelf_location: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600">
                    {formError}
                  </div>
                )}

                <button
                  type="submit" disabled={formLoading}
                  className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-all"
                >
                  {formLoading ? 'Saving...' : savedMedicineId ? '✓ Saved — Update Info' : 'Save Medicine & Add Units Below'}
                </button>
              </form>
            </div>

            {/* SECTION 2: Selling Units — only shown after medicine is saved */}
            {savedMedicineId && (
              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                  2. Selling Units & Pricing
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Define the different units this medicine can be sold in. The base unit is <strong className="text-gray-700 capitalize">{form.unit}</strong> at <strong className="text-gray-700">GH₵ {form.price}</strong>.
                </p>

                {/* Existing units */}
                {sellingUnits.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {sellingUnits.map(unit => (
                      <div key={unit.id}
                        className="flex items-center justify-between bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-800 capitalize">{unit.unit_name}</span>
                          <span className="text-xs text-gray-500">= {unit.quantity_in_base_units} {form.unit}(s)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-teal-700">GH₵ {Number(unit.price).toFixed(2)}</span>
                          <button
                            onClick={() => handleDeleteUnit(unit.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new unit row */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 mb-3">Add a selling unit:</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Unit Name</label>
                      <select
                        value={newUnit.unit_name}
                        onChange={e => setNewUnit({ ...newUnit, unit_name: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Select...</option>
                        {BASE_UNITS.map(u => (
                          <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Price (GH₵)</label>
                      <input
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={newUnit.price}
                        onChange={e => setNewUnit({ ...newUnit, price: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Base units qty</label>
                      <input
                        type="number" min="1"
                        placeholder="e.g. 10"
                        value={newUnit.quantity_in_base_units}
                        onChange={e => setNewUnit({ ...newUnit, quantity_in_base_units: e.target.value })}
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    e.g. 1 strip = 10 tablets → unit name: strip, base units qty: 10
                  </p>
                  {unitError && (
                    <p className="text-xs text-red-600 font-semibold mb-2">{unitError}</p>
                  )}
                  <button
                    onClick={handleAddUnit} disabled={unitLoading}
                    className="w-full bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-lg text-sm transition-all"
                  >
                    {unitLoading ? 'Adding...' : '+ Add Unit'}
                  </button>
                </div>

                <button
                  onClick={closeForm}
                  className="w-full mt-4 bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl text-sm transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search database by generic or brand name..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-lg p-3 border border-gray-300 rounded-xl text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      {/* Medicine Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400 font-medium">Loading inventory...</div>
      ) : medicines.length === 0 ? (
        <div className="text-center py-16 text-gray-400 font-medium">
          No medicines found. Add one using the button above.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4 text-left">Item Description</th>
                <th className="px-5 py-4 text-left">Base Unit</th>
                <th className="px-5 py-4 text-left">Selling Units</th>
                <th className="px-5 py-4 text-left">Active Batches</th>
                <th className="px-5 py-4 text-right">Total Stock</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {medicines.map(medicine => {
                const stock = totalStock(medicine);
                return (
                  <tr key={medicine.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-gray-900">{medicine.name}</div>
                      <div className="text-xs text-gray-400 font-mono">ID: #{medicine.id}</div>
                      {medicine.shelf_location && (
                        <div className="text-xs text-gray-400">{medicine.shelf_location}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-md capitalize w-fit">
                          {medicine.unit || 'tablet'}
                        </span>
                        <span className="text-xs text-gray-400">GH₵ {Number(medicine.price || 0).toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {medicine.medicine_units && medicine.medicine_units.length > 0 ? (
                          medicine.medicine_units.map(u => (
                            <span key={u.id}
                              className="text-xs bg-teal-50 text-teal-700 border border-teal-100 font-bold px-2 py-1 rounded-md capitalize">
                              {u.unit_name} — GH₵ {Number(u.price).toFixed(2)}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">No selling units defined</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {medicine.batches && medicine.batches.length > 0 ? (
                          medicine.batches.map(batch => (
                            <span key={batch.id}
                              className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-1 rounded-md border border-gray-200">
                              {batch.batch_number} ({batch.quantity}u)
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">No batches</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-black" style={{ color: stockColor(stock) }}>
                        {stock} {medicine.unit || 'units'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEditForm(medicine)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 transition-all">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(medicine.id, medicine.name)}
                          className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-all">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
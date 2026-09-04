import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import api from '../api';
import { getLocalMedicines } from '../db/indexedDB';
import { syncEngine } from '../services/syncEngine';

api.defaults.withCredentials = true;

function CounterDesk() {
  const [searchQuery, setSearchQuery]       = useState('');
  const [medicines, setMedicines]           = useState([]);
  const [cart, setCart]                     = useState([]);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [ticketNumber, setTicketNumber]     = useState(null);
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);

  // Tracks which unit is selected per medicine (medicine.id -> unit object)
  const [selectedUnits, setSelectedUnits]   = useState({});

  const getStock = (med) => {
    if (med.batches && Array.isArray(med.batches)) {
      return med.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
    }
    return med.total_stock ?? med.stock_level ?? 0;
  };

  // Get the currently selected unit for a medicine, defaulting to base unit
  const getSelectedUnit = (med) => {
    if (selectedUnits[med.id]) return selectedUnits[med.id];
    // Default to first selling unit if available, otherwise base unit
    if (med.medicine_units && med.medicine_units.length > 0) {
      return med.medicine_units[0];
    }
    return { unit_name: med.unit || 'tablet', price: med.price, quantity_in_base_units: 1 };
  };

  const getDisplayPrice = (med) => {
    return getSelectedUnit(med).price;
  };

  const fetchMedicines = async () => {
    if (navigator.onLine) {
      try {
        const response = await api.get(`/medicines?search=${encodeURIComponent(searchQuery)}`);
        setMedicines(response.data);
        return;
      } catch (error) {
        console.warn('Online request failed, switching to local Dexie cache:', error);
      }
    }
    try {
      const allLocalMeds = await getLocalMedicines();
      if (!searchQuery.trim()) {
        setMedicines(allLocalMeds);
      } else {
        const query = searchQuery.toLowerCase();
        const filtered = allLocalMeds.filter((med) =>
          med.name?.toLowerCase().includes(query) || med.barcode?.includes(query)
        );
        setMedicines(filtered);
      }
    } catch (dbError) {
      console.error('Error fetching local medicines from Dexie:', dbError);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { fetchMedicines(); }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleUnitChange = (med, unitId) => {
    const allUnits = [
      { unit_name: med.unit || 'tablet', price: med.price, quantity_in_base_units: 1, id: 'base' },
      ...(med.medicine_units || [])
    ];
    const selected = allUnits.find(u => String(u.id) === String(unitId));
    if (selected) {
      setSelectedUnits(prev => ({ ...prev, [med.id]: selected }));
      // Update price in cart if this medicine is already in cart
      setCart(prev => prev.map(item =>
        item.id === med.id
          ? { ...item, price: selected.price, selectedUnit: selected, quantity_in_base_units: selected.quantity_in_base_units }
          : item
      ));
    }
  };

  const addToCart = (medicine) => {
    const stock = getStock(medicine);
    const selectedUnit = getSelectedUnit(medicine);
    const existing = cart.find((item) => item.id === medicine.id && item.selectedUnit?.unit_name === selectedUnit.unit_name);

    if (existing) {
      const newBaseQty = (existing.quantity + 1) * selectedUnit.quantity_in_base_units;
      if (newBaseQty > stock) {
        alert(`Cannot add more. Only ${stock} ${medicine.unit || 'units'} available in stock.`);
        return;
      }
      setCart(cart.map((item) =>
        item.id === medicine.id && item.selectedUnit?.unit_name === selectedUnit.unit_name
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      if (selectedUnit.quantity_in_base_units > stock) {
        alert(`Cannot add. Only ${stock} ${medicine.unit || 'units'} available in stock.`);
        return;
      }
      setCart([...cart, {
        ...medicine,
        price: selectedUnit.price,
        selectedUnit,
        quantity_in_base_units: selectedUnit.quantity_in_base_units,
        quantity: 1,
        availableStock: stock
      }]);
    }
  };

  const updateQuantity = (id, unitName, amount, maxStock, qtyInBase) => {
    setCart(cart.map((item) => {
      if (item.id === id && item.selectedUnit?.unit_name === unitName) {
        const newQty = item.quantity + amount;
        const newBaseQty = newQty * qtyInBase;
        if (newBaseQty > maxStock) {
          alert(`Only ${maxStock} ${item.unit || 'units'} available in stock.`);
          return item;
        }
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id, unitName) => {
    setCart(cart.filter((item) => !(item.id === id && item.selectedUnit?.unit_name === unitName)));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const handleGenerateTicket = async () => {
    if (cart.length === 0) return alert('Your cart is empty!');
    setIsSubmitting(true);
    try {
      const formattedItems = cart.map((item) => ({
        medicine_id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        price_at_sale: item.price,
        unit_name: item.selectedUnit?.unit_name || item.unit || 'tablet',
        quantity_in_base_units: item.selectedUnit?.quantity_in_base_units || 1,
        // Total base units to deduct from stock
        base_quantity: item.quantity * (item.selectedUnit?.quantity_in_base_units || 1)
      }));

      const payload = {
        order: {
          total_amount: calculateTotal(),
          order_items_attributes: formattedItems,
          items: formattedItems
        },
        items: formattedItems
      };

      const orderResult = await syncEngine.submitOrder(payload);
      const generatedId = orderResult.data?.id || `OFFLINE-${Date.now()}`;
      setTicketNumber(generatedId);
      setLastCreatedOrder({
        id: generatedId,
        items: [...cart],
        total: calculateTotal(),
        isOffline: orderResult.offline || false
      });
      setCart([]);
      setSelectedUnits({});
      await fetchMedicines();

      const statusMsg = orderResult.offline
        ? `Offline Ticket #${generatedId} saved locally! It will auto-sync when online.`
        : `Ticket #${generatedId} Generated Successfully!`;
      alert(statusMsg);
    } catch (error) {
      const serverMessage = error.message || error.response?.data?.error || 'Error creating order.';
      alert(serverMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* LEFT & CENTER: Stock Search Sheet */}
      <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-blue-600">Counter Desk Module</h2>
          <button onClick={fetchMedicines}
            className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-all">
            🔄 Refresh Stock
          </button>
        </div>
        <p className="text-gray-600 mb-6">Build customer orders and view live inventory status below.</p>

        <div className="mb-6">
          <input
            type="text"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search medications (e.g., paracetamol)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <h3 className="text-lg font-semibold text-gray-700 mb-3">Available Pharmacy Stock</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-gray-500 text-sm">
                <th className="pb-2">Medication Name</th>
                <th className="pb-2">Selling Unit</th>
                <th className="pb-2">Price</th>
                <th className="pb-2">Stock Level</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((med) => {
                const totalStock = getStock(med);
                const selectedUnit = getSelectedUnit(med);

                // Build unit options: base unit + all selling units
                const unitOptions = [
                  { id: 'base', unit_name: med.unit || 'tablet', price: med.price, quantity_in_base_units: 1 },
                  ...(med.medicine_units || [])
                ];

                return (
                  <tr key={`${med.id}-${selectedUnit.unit_name}`} className="border-b hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{med.name}</td>
                    <td className="py-3">
                      {unitOptions.length > 1 ? (
                        <select
                          value={selectedUnits[med.id]?.id || 'base'}
                          onChange={e => handleUnitChange(med, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 capitalize"
                        >
                          {unitOptions.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.unit_name.charAt(0).toUpperCase() + u.unit_name.slice(1)} — GH₵ {Number(u.price).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">
                          {med.unit || 'tablet'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-gray-600 font-semibold">
                      {formatCurrency(getDisplayPrice(med))}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${totalStock < 20 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {totalStock} {med.unit || 'units'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => addToCart(med)}
                        disabled={totalStock <= 0}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium disabled:bg-gray-300 cursor-pointer"
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                );
              })}
              {medicines.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-gray-400">
                    No medications found matching "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className="bg-gray-50 p-6 rounded-lg shadow-md border border-gray-200 h-fit">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Current Order</h3>

        {ticketNumber && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 p-3 rounded text-center">
            Last Generated Ticket ID: <strong className="text-lg">#{ticketNumber}</strong>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Cart is empty. Select items from the stock sheet to build a queue ticket.
          </div>
        ) : (
          <>
            <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
              {cart.map((item) => (
                <div key={`${item.id}-${item.selectedUnit?.unit_name}`}
                  className="flex justify-between items-center bg-white p-3 rounded shadow-sm border">
                  <div>
                    <h4 className="font-semibold text-gray-800 text-sm">{item.name}</h4>
                    <p className="text-xs text-gray-500 capitalize">
                      {item.selectedUnit?.unit_name || item.unit || 'tablet'} — {formatCurrency(item.price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded border">
                      <button
                        onClick={() => updateQuantity(item.id, item.selectedUnit?.unit_name, -1, item.availableStock, item.selectedUnit?.quantity_in_base_units || 1)}
                        className="w-6 h-6 flex items-center justify-center bg-white border rounded text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      >-</button>
                      <span className="text-xs font-bold px-1 min-w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.selectedUnit?.unit_name, 1, item.availableStock, item.selectedUnit?.quantity_in_base_units || 1)}
                        className="w-6 h-6 flex items-center justify-center bg-white border rounded text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                      >+</button>
                    </div>
                    <div className="text-right min-w-16.25">
                      <span className="font-bold text-sm text-gray-700 block">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id, item.selectedUnit?.unit_name)}
                      className="text-gray-400 hover:text-red-500 text-sm font-bold pl-1 cursor-pointer"
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>

            <hr className="my-3 border-gray-300" />

            <div className="flex justify-between items-center mb-6">
              <span className="text-gray-600 font-medium">Estimated Total:</span>
              <span className="text-2xl font-black text-gray-900">{formatCurrency(calculateTotal())}</span>
            </div>

            <button
              onClick={handleGenerateTicket}
              disabled={isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded-md font-bold tracking-wide transition-colors disabled:bg-gray-400 cursor-pointer"
            >
              {isSubmitting ? 'Generating...' : 'Generate Counter Ticket'}
            </button>
          </>
        )}
      </div>

      {/* Floating print popup */}
      {lastCreatedOrder && (
        <div className="fixed bottom-6 right-6 bg-white p-5 rounded-xl shadow-2xl border-2 border-emerald-500 z-50 max-w-xs">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-700 font-medium">
              Ticket <strong className="text-emerald-600 font-extrabold">#{lastCreatedOrder.id}</strong> built successfully.
            </p>
            <button onClick={() => setLastCreatedOrder(null)}
              className="text-xs text-gray-400 hover:text-gray-600 font-bold ml-2 cursor-pointer">✕</button>
          </div>
          <button onClick={() => window.print()}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer">
            🖨️ Print Customer Slip
          </button>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media screen { .thermal-print-area { display: none !important; } }
        @media print {
          body * { display: none !important; }
          .thermal-print-area, .thermal-print-area * { display: block !important; }
          .thermal-print-area {
            position: absolute; left: 0; top: 0;
            width: 58mm; padding: 2mm; background: #fff;
          }
        }
      `}</style>

      {/* Print receipt */}
      {lastCreatedOrder && (
        <div className="thermal-print-area p-2 font-mono text-xs text-black bg-white">
          <div className="text-center mb-3">
            <h3 className="m-0 font-black text-sm tracking-tight">RxLocal Pharmacy</h3>
            <p className="my-0.5 text-[10px] text-gray-700">Counter Order Slip</p>
            <div className="border-t border-dashed border-black my-1.5" />
            <h2 className="my-1 text-xl font-black tracking-tight">TICKET #{lastCreatedOrder.id}</h2>
            <p className="m-0 text-[9px] text-gray-600">{new Date().toLocaleString()}</p>
          </div>
          <div className="mb-2 text-[11px] space-y-1">
            {lastCreatedOrder.items.map((item) => (
              <div key={`${item.id}-${item.selectedUnit?.unit_name}`}
                className="flex justify-between items-center gap-2">
                <span className="truncate capitalize">
                  {item.name} (x{item.quantity} {item.selectedUnit?.unit_name || item.unit || 'tablet'})
                </span>
                <span className="font-semibold whitespace-nowrap">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-black my-1.5" />
          <div className="flex justify-between items-center font-bold text-sm">
            <span>Est. Total:</span>
            <span className="text-base font-black">{formatCurrency(lastCreatedOrder.total)}</span>
          </div>
          <div className="text-center mt-5 text-[9px] space-y-0.5 text-gray-700">
            <p className="m-0">Please hand this slip to the Cashier Desk.</p>
            <p className="m-0 font-bold text-black">Thank you!</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CounterDesk;
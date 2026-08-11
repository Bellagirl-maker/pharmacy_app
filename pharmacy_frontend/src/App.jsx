import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import api from './api';
import cable from './cable';

import CounterDesk from './pages/CounterDesk';
import CashierDesk from './pages/CashierDesk';
import OwnerDashboard from './pages/OwnerDashboard';
import InventoryDesk from './pages/InventoryDesk';

import { syncEngine } from './services/syncEngine';
import { db, cacheMedicinesLocally } from './db/indexedDB';

function NavigationHeader({
  isAuthenticated,
  userRole,
  activeUsername,
  handleLogout,
  orders = [],
  onOpenChangePassword,
  isNetworkOnline,
  unsyncedCount
}) {
  const location = useLocation();

  const pendingCount = orders.filter(
    (order) => order.status === 'pending' || order.status === 'draft'
  ).length;

  const linkClass = (path) => `
    px-4 py-2 rounded-md font-bold text-sm transition-all flex items-center gap-2
    ${location.pathname === path
      ? 'bg-white text-teal-800 shadow-xs'
      : 'text-white hover:bg-teal-600/50'}
  `;

  return (
    <header className="bg-teal-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl p-1.5 bg-teal-700/60 rounded-lg">💊</span>
          <div>
            <h1 className="text-xl font-black tracking-tight select-none">RxLocal Workspace</h1>
            <div className="flex items-center gap-2 text-[11px] font-semibold mt-0.5">
              <span className={`inline-block w-2 h-2 rounded-full ${isNetworkOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="text-teal-100">
                {isNetworkOnline ? 'System Online' : 'Offline Mode (Local Storage Active)'}
              </span>
              {unsyncedCount > 0 && (
                <span className="bg-amber-500 text-slate-900 font-mono font-bold px-1.5 py-0.2 rounded text-[10px]">
                  {unsyncedCount} Queued
                </span>
              )}
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-2 bg-teal-900/40 p-1.5 rounded-xl border border-teal-700/50">
          {(userRole === 'counter' || userRole === 'owner') && (
            <Link to="/" className={linkClass('/')}>Counter Desk</Link>
          )}
          {(userRole === 'cashier' || userRole === 'owner') && (
            <Link to="/cashier" className={linkClass('/cashier')}>
              <span>Cashier Desk</span>
              {pendingCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-black px-2 py-0.5 rounded-full min-w-[18px] text-center shadow-xs animate-bounce">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
          {(userRole === 'inventory' || userRole === 'owner') && (
            <Link to="/inventory" className={linkClass('/inventory')}>📦 Inventory</Link>
          )}
          {userRole === 'owner' && (
            <Link to="/owner" className={linkClass('/owner')}>🛡️ Owner Control</Link>
          )}
          {isAuthenticated && (
            <div className="flex items-center gap-3 pl-3 border-l border-teal-700/60 ml-1">
              <button
                onClick={onOpenChangePassword}
                title="Click to update password"
                className="flex items-center gap-2 bg-teal-950/40 hover:bg-teal-950/70 border border-teal-600/40 px-2.5 py-1 rounded-lg transition-all cursor-pointer group"
              >
                <span className="text-xs font-mono text-teal-200 font-bold group-hover:text-white">
                  👤 {activeUsername || 'staff'}
                </span>
                <span className="text-teal-500/50 text-xs">|</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-teal-700 text-white">
                  {userRole}
                </span>
              </button>
              <button
                onClick={handleLogout}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
              >
                Exit
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

function ProtectedGate({ isAuthenticated, userRole, allowedRoles, children, onOpenLogin }) {
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white p-8 rounded-2xl shadow-xs border border-slate-200 text-center">
        <span className="text-4xl block mb-2">🔒</span>
        <h3 className="text-lg font-black text-slate-800 mb-1">Authentication Required</h3>
        <p className="text-xs text-slate-500 mb-6">Sign into your workstation account to open this clinical desk.</p>
        <button
          onClick={onOpenLogin}
          className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-xs w-full cursor-pointer text-xs uppercase tracking-wider"
        >
          Workspace Sign In
        </button>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white p-8 rounded-2xl shadow-xs border border-slate-200 text-center space-y-2">
        <span className="text-4xl block">🚫</span>
        <h3 className="text-lg font-black text-rose-600">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Your active status (<span className="font-mono font-bold text-slate-700 uppercase">{userRole}</span>)
          is not clearance-approved for this desk.
        </p>
      </div>
    );
  }

  return children;
}

export default function App() {
  const navigate = useNavigate();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [activeUsername, setActiveUsername] = useState('');

  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [orders, setOrders] = useState([]);

  // --- Restore auth session from localStorage on app load ---
  // This prevents browser refresh from logging the user out.
  useEffect(() => {
    const savedAuth = localStorage.getItem('pharmacy_auth');
    if (savedAuth) {
      try {
        const { id, username: savedUsername, role } = JSON.parse(savedAuth);
        if (id && savedUsername && role) {
          localStorage.setItem('manager_id', id);
          setIsAuthenticated(true);
          setUserRole(role);
          setActiveUsername(savedUsername);
        }
      } catch {
        localStorage.removeItem('pharmacy_auth');
      }
    }
  }, []);

  const syncLocalInventoryCache = useCallback(async () => {
    try {
      const response = await api.get('/medicines');
      if (Array.isArray(response.data)) {
        await cacheMedicinesLocally(response.data);
      }
    } catch (err) {
      console.warn('Could not update local medicine cache:', err);
    }
  }, []);

  const updateQueueCount = useCallback(async () => {
    const count = await db.offlineOrders.where('synced').equals(0).count();
    setUnsyncedCount(count);
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!navigator.onLine) {
      const cachedOrders = await db.offlineOrders.toArray();
      setOrders(cachedOrders);
      return;
    }
    try {
      const response = await api.get('/orders');
      setOrders(response.data || []);
    } catch (err) {
      console.warn('Failed network orders fetch, reading local state:', err);
    }
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setIsNetworkOnline(true);
      await syncEngine.flushOfflineQueue();
      await updateQueueCount();
      await fetchOrders();
    };
    const handleOffline = () => setIsNetworkOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateQueueCount();
    syncLocalInventoryCache();
    fetchOrders();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchOrders, syncLocalInventoryCache, updateQueueCount]);

  useEffect(() => {
    if (!isNetworkOnline) return;
    const channel = cable.subscriptions.create({ channel: 'OrdersChannel' }, {
      received: (data) => {
        if (data.event === 'order_created' && data.order) {
          const formatted = { ...data.order, order_items: data.order.order_items || [] };
          setOrders(prev => prev.some(o => o.id === formatted.id) ? prev : [formatted, ...prev]);
        } else if (data.event === 'order_paid' || data.event === 'order_dispensed') {
          setOrders(prev => prev.map(o => o.id === data.order.id ? { ...o, ...data.order } : o));
        } else if (data.event === 'order_voided' && data.order) {
          setOrders(prev => prev.map(o => o.id === data.order.id ? { ...o, status: 'VOIDED', ...data.order } : o));
        }
      }
    });
    return () => channel.unsubscribe();
  }, [isNetworkOnline]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError(null);

    const usernameInput = username.toLowerCase().trim();

    // --- OFFLINE LOGIN: use cached credentials ---
    if (!navigator.onLine) {
      const savedAuth = localStorage.getItem('pharmacy_auth');
      if (savedAuth) {
        try {
          const cached = JSON.parse(savedAuth);
          if (cached.username === usernameInput) {
            // Allow offline access with matching username
            // Note: password is not verified offline for practicality
            localStorage.setItem('manager_id', cached.id);
            setIsAuthenticated(true);
            setUserRole(cached.role);
            setActiveUsername(cached.username);
            setShowLoginModal(false);
            setUsername('');
            setPassword('');
            if (cached.role === 'inventory') navigate('/inventory');
            else if (cached.role === 'cashier') navigate('/cashier');
            else if (cached.role === 'owner') navigate('/owner');
            else navigate('/');
            return;
          } else {
            setLoginError('Offline mode: only the last logged-in user can access the system.');
            return;
          }
        } catch {
          setLoginError('Offline mode: no cached session found. Connect to the internet to login.');
          return;
        }
      }
      setLoginError('No cached session found. Please connect to the internet to login.');
      return;
    }

    // --- ONLINE LOGIN ---
    try {
      const response = await api.post('/login', { username, password });

      if (response.data.success) {
        const assignedRole = response.data.role || 'counter';

        // Persist auth so browser refresh doesn't log the user out
        localStorage.setItem('manager_id', response.data.id);
        localStorage.setItem('pharmacy_auth', JSON.stringify({
          id: response.data.id,
          username: usernameInput,
          role: assignedRole
        }));

        setIsAuthenticated(true);
        setUserRole(assignedRole);
        setActiveUsername(usernameInput);
        setShowLoginModal(false);
        setUsername('');
        setPassword('');

        if (assignedRole === 'inventory') navigate('/inventory');
        else if (assignedRole === 'cashier') navigate('/cashier');
        else if (assignedRole === 'owner') navigate('/owner');
        else navigate('/');
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Invalid credentials.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('manager_id');
    localStorage.removeItem('pharmacy_auth');
    setIsAuthenticated(false);
    setUserRole(null);
    setActiveUsername('');
  };

  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      await api.patch('/profile/change_password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setPasswordSuccess("Password updated successfully.");
      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccess(null);
      }, 1200);
    } catch (err) {
      setPasswordError(err.response?.data?.error || "Failed to update password.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <NavigationHeader
        isAuthenticated={isAuthenticated}
        userRole={userRole}
        activeUsername={activeUsername}
        handleLogout={handleLogout}
        orders={orders}
        onOpenChangePassword={() => setShowPasswordModal(true)}
        isNetworkOnline={isNetworkOnline}
        unsyncedCount={unsyncedCount}
      />

      <main className="flex-grow py-4">
        <Routes>
          <Route path="/" element={
            <ProtectedGate isAuthenticated={isAuthenticated} userRole={userRole} allowedRoles={['counter', 'owner']} onOpenLogin={() => setShowLoginModal(true)}>
              <CounterDesk isNetworkOnline={isNetworkOnline} />
            </ProtectedGate>
          } />
          <Route path="/cashier" element={
            <ProtectedGate isAuthenticated={isAuthenticated} userRole={userRole} allowedRoles={['cashier', 'owner']} onOpenLogin={() => setShowLoginModal(true)}>
              <CashierDesk orders={orders} fetchOrders={fetchOrders} isNetworkOnline={isNetworkOnline} />
            </ProtectedGate>
          } />
          <Route path="/inventory" element={
            <ProtectedGate isAuthenticated={isAuthenticated} userRole={userRole} allowedRoles={['inventory', 'owner']} onOpenLogin={() => setShowLoginModal(true)}>
              <InventoryDesk isNetworkOnline={isNetworkOnline} />
            </ProtectedGate>
          } />
          <Route path="/owner" element={
            <ProtectedGate isAuthenticated={isAuthenticated} userRole={userRole} allowedRoles={['owner']} onOpenLogin={() => setShowLoginModal(true)}>
              <OwnerDashboard orders={orders} isNetworkOnline={isNetworkOnline} />
            </ProtectedGate>
          } />
        </Routes>
      </main>

      {showLoginModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6 relative">
            <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold">✕</button>
            <h3 className="text-base font-bold text-slate-900 mb-1">Workstation Login</h3>
            <p className="text-xs text-slate-500 mb-1">Enter credentials to unlock terminal.</p>
            {!isNetworkOnline && (
              <p className="text-xs text-amber-600 font-semibold mb-3">
                📴 Offline — only the last logged-in user can sign in without internet.
              </p>
            )}
            <form onSubmit={handleLoginSubmit} className="space-y-3 text-xs mt-3">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1">Username</label>
                <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1">Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              {loginError && <p className="text-xs text-rose-600 font-semibold">{loginError}</p>}
              <button type="submit" className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 rounded-xl transition-all shadow-xs cursor-pointer">
                Verify Credentials
              </button>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 relative">
            <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold">✕</button>
            <h3 className="text-base font-bold text-slate-900 mb-1">🔑 Update Password</h3>
            <p className="text-xs text-slate-500 mb-4">Security clearance profile: <strong className="text-slate-800">@{activeUsername}</strong></p>
            {passwordError && <div className="mb-3 p-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold">{passwordError}</div>}
            {passwordSuccess && <div className="mb-3 p-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold">{passwordSuccess}</div>}
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1">Current Password</label>
                <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1">New Password</label>
                <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1">Confirm New Password</label>
                <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPasswordModal(false)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={isUpdatingPassword}
                  className="w-1/2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl cursor-pointer shadow-xs">
                  {isUpdatingPassword ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="text-center py-3 text-[11px] text-slate-400 bg-white border-t border-slate-200/80">
        RxLocal Clinical POS &bull; Hybrid Offline Sync Enabled &bull; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * @param {boolean} isAuthenticated - Global authentication state
 * @param {string} userRole - The authenticated user's specific group ('counter', 'cashier', 'inventory', 'owner')
 * @param {Array<string>} allowedRoles - Array of roles permitted to view this specific page
 */
export default function ProtectedRoute({ 
  isAuthenticated, 
  userRole, 
  allowedRoles, 
  children 
}) {
  const location = useLocation();

  // 1. If not logged in at all, redirect to the centralized login gateway
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. If logged in but lacks the specific role authorization clearance
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div className="max-w-md mx-auto my-16 bg-white p-8 rounded-xl shadow-md border text-center space-y-4">
        <span className="text-4xl">🚫</span>
        <h2 className="text-xl font-black text-red-600">Access Denied</h2>
        <p className="text-sm text-gray-500">
          Your account role (<span className="font-mono font-bold text-gray-700">{userRole}</span>) 
          is not authorized to access this desk location.
        </p>
      </div>
    );
  }

  // 3. Authorization cleared, render the page layout smoothly
  return children;
}
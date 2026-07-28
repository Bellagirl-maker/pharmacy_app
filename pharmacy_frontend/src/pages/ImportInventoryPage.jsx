import React from 'react';
import { useNavigate } from 'react-router-dom';
import InventoryBulkImport from '../components/InventoryBulkImport';

export default function ImportInventoryPage() {
  const navigate = useNavigate();

  const handleRedirect = () => {
    // Automatically send the owner back to the dashboard once the import finishes successfully
    navigate('/owner-dashboard'); 
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* Back Navigation Link */}
        <button 
          onClick={() => navigate(-1)} 
          className="text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
        >
          ← Back to Systems Dashboard
        </button>

        {/* The Import Panel */}
        <InventoryBulkImport onImportSuccess={handleRedirect} />
        
      </div>
    </div>
  );
}
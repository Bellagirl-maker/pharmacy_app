import React, { useState } from 'react';
import api from '../api';

export default function InventoryBulkImport({ onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatusMessage({ type: '', text: '' });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatusMessage({ type: 'error', text: 'Please select a clean CSV template file first.' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setStatusMessage({ type: 'info', text: 'Parsing spreadsheet arrays... please wait.' });

    try {
      const response = await api.post(`/inventory/import`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setStatusMessage({ type: 'success', text: response.data.message });
      setFile(null);
      
      // Trigger a structural baseline re-fetch if parent views are hooked up
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'System failed to parse inventory matrix.';
      setStatusMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-xl">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          📊 Mass Product Import Engine
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Upload standard legacy data streams via CSV files to initialize product stocks instantly.
        </p>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors">
          <span className="text-2xl mb-2">📁</span>
          <label className="block text-center cursor-pointer">
            <span className="text-sm font-bold text-blue-600 block hover:underline">
              {file ? file.name : 'Select or drop inventory spreadsheet file'}
            </span>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
          <span className="text-[10px] text-gray-400 mt-1 block">Only standard comma-separated .csv data accepted</span>
        </div>

        {/* Informative Downstream Notice */}
        <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100 text-[11px] text-blue-700 font-medium">
          💡 <strong>Required headers:</strong> <code>medicine_name</code>, <code>batch_number</code>, <code>quantity</code>, <code>expiry_date</code> (Format: YYYY-MM-DD).
        </div>

        {/* Dynamic State Alert Rails */}
        {statusMessage.text && (
          <div className={`p-3 rounded-lg text-xs font-bold border ${
            statusMessage.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' :
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
            'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            {statusMessage.text}
          </div>
        )}

        <button
          type="submit"
          disabled={isUploading || !file}
          className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all shadow-sm ${
            isUploading || !file 
              ? 'bg-gray-300 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
          }`}
        >
          {isUploading ? 'Executing Bulk Inserts...' : 'Run Automated Import Routine'}
        </button>
      </form>
    </div>
  );
}
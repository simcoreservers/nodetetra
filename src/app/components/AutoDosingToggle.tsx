'use client';

import React, { useState, useEffect } from 'react';
import { useAutoDosing } from '../hooks/useAutoDosing';

const AutoDosingToggle = () => {
  const { 
    config, 
    isLoading, 
    error, 
    toggleEnabled 
  } = useAutoDosing({ refreshInterval: 10000 });
  
  const handleToggle = async () => {
    await toggleEnabled();
  };

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="card-title">Auto-Dosing</h2>
        {!isLoading && config && (
          <div className="flex items-center">
            <span className="mr-3 text-sm text-gray-400">
              {config.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={handleToggle}
              disabled={isLoading}
              className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00a3e0] focus:ring-offset-2 ${
                config.enabled ? 'bg-[#00a3e0]' : 'bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-sm">Error loading auto-dosing status</div>
        ) : config ? (
          <div>
            <p className="text-sm text-gray-400 mb-3">
              Auto-dosing system automatically monitors and maintains optimal pH and EC levels based on your active plant profile.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">pH Target:</span>
                <p className="font-medium">{config.targets.ph.target} ± {config.targets.ph.tolerance}</p>
              </div>
              <div>
                <span className="text-gray-400">EC Target:</span>
                <p className="font-medium">{config.targets.ec.target} ± {config.targets.ec.tolerance} mS/cm</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Configure detailed auto-dosing settings in the Dosing section.
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Auto-dosing system not configured.</p>
        )}
      </div>
    </div>
  );
};

export default AutoDosingToggle; 
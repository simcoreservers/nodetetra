'use client';

import React, { memo } from 'react';
import Link from "next/link";

interface PumpStatus {
  name: string;
  active: boolean;
}

interface PumpStatusCardProps {
  pumpStatus: PumpStatus[] | null;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
}

const PumpStatusCard = memo(function PumpStatusCard({
  pumpStatus,
  isLoading,
  hasError,
  errorMessage
}: PumpStatusCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Pump Status</h2>
        <Link href="/pumps" className="btn text-sm">Manual Control</Link>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse text-center py-4">Loading pump status...</div>
        ) : hasError ? (
          <div className="text-red-500 p-3 border border-red-700/50 bg-red-900/20 rounded">
            Error loading pump status: {errorMessage || 'Unknown error'}
          </div>
        ) : !pumpStatus || pumpStatus.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No pump data available</div>
        ) : (
          pumpStatus.map((pump, index) => (
            <div key={index} className="flex justify-between items-center border-b border-[#333333] pb-2 last:border-0">
              <div className="flex items-center">
                <div className={`status-indicator ${pump.active ? 'status-good' : ''}`}></div>
                <span className="text-white">{pump.name}</span>
              </div>
              <span className="text-gray-300">{pump.active ? 'Active' : 'Idle'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default PumpStatusCard; 
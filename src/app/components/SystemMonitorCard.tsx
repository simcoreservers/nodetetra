'use client';

import React, { memo } from 'react';
import { useSystemMonitor, SystemMonitorData } from '../hooks/useSystemMonitor';

interface SystemMonitorCardProps {
  refreshInterval?: number;
}

const SystemMonitorCard = memo(function SystemMonitorCard({
  refreshInterval = 5000
}: SystemMonitorCardProps) {
  const { data, isLoading, error } = useSystemMonitor({ refreshInterval });

  // Get status based on usage percentage 
  const getCpuStatus = (usage: number) => {
    if (usage >= 80) return "status-danger";
    if (usage >= 60) return "status-warning";
    return "status-good";
  };

  const getMemoryStatus = (usage: number) => {
    if (usage >= 90) return "status-danger";
    if (usage >= 70) return "status-warning";
    return "status-good";
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">System Monitor</h2>
      </div>

      {isLoading ? (
        <div className="p-4 animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      ) : error ? (
        <div className="p-4 text-red-500">Error loading system data</div>
      ) : data ? (
        <div className="p-4">
          {/* CPU Usage */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">CPU Usage</span>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${getCpuStatus(data.cpu.usage) === 'status-good' ? 'bg-green-500' : getCpuStatus(data.cpu.usage) === 'status-warning' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-bold">{data.cpu.usage}%</span>
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  getCpuStatus(data.cpu.usage) === 'status-good' 
                    ? 'bg-green-500' 
                    : getCpuStatus(data.cpu.usage) === 'status-warning' 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
                style={{ width: `${data.cpu.usage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-400 mt-1">{data.cpu.model} ({data.cpu.cores} cores)</div>
          </div>

          {/* Memory Usage */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">Memory Usage</span>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${getMemoryStatus(data.memory.usage) === 'status-good' ? 'bg-green-500' : getMemoryStatus(data.memory.usage) === 'status-warning' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-bold">{data.memory.usage}%</span>
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  getMemoryStatus(data.memory.usage) === 'status-good' 
                    ? 'bg-green-500' 
                    : getMemoryStatus(data.memory.usage) === 'status-warning' 
                      ? 'bg-yellow-500' 
                      : 'bg-red-500'
                }`}
                style={{ width: `${data.memory.usage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-400 mt-1">{data.memory.used} / {data.memory.total}</div>
          </div>

          {/* System Info */}
          <div className="text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-400">Uptime:</span>
              <span>{data.system.uptime}</span>
            </div>
          </div>
          
          <div className="text-xs text-gray-500 mt-4 text-right">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ) : (
        <div className="p-4">No data available</div>
      )}
    </div>
  );
});

export default SystemMonitorCard; 
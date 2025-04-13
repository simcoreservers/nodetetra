'use client';

import { useAutoDosing } from '@/app/hooks/useAutoDosing';
import { formatDistanceToNow } from 'date-fns';

export default function AutoDosingCard() {
  const { status, isLoading, error, manualCheck } = useAutoDosing(30000); // Check every 30 seconds
  
  const getStatusClass = () => {
    if (isLoading) return 'bg-gray-700';
    if (error) return 'bg-red-900/30';
    if (!status?.isAutoEnabled) return 'bg-yellow-900/30';
    return 'bg-green-900/30';
  };
  
  const getStatusText = () => {
    if (isLoading) return 'Loading...';
    if (error) return 'Error';
    if (!status?.isAutoEnabled) return 'Disabled';
    return 'Enabled';
  };
  
  // Format the timestamp for better display
  const getTimeSince = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return timestamp;
    }
  };
  
  return (
    <div className="card h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="card-title">Auto-Dosing Status</h2>
        <div className="flex items-center">
          <span className={`px-2 py-1 rounded text-xs ${getStatusClass()}`}>
            {getStatusText()}
          </span>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center p-6">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#00a3e0]"></div>
          <span className="ml-2">Checking status...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-900/20 rounded-lg">
          <p className="text-red-400">{error.message}</p>
          <button onClick={manualCheck} className="btn btn-sm mt-3">
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Last check:</span>
              <span>{getTimeSince(status?.timestamp)}</span>
            </div>
            {status?.nextCheck && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Next check:</span>
                <span>{getTimeSince(status.nextCheck)}</span>
              </div>
            )}
          </div>
          
          <div className="border-t border-[#333333] pt-4 mt-4">
            <h3 className="text-sm font-medium mb-2">Latest Actions</h3>
            {status?.dosingActions && status.dosingActions.length > 0 ? (
              <ul className="text-sm space-y-2 max-h-32 overflow-y-auto">
                {status.dosingActions.map((action, index) => (
                  <li key={index} className="bg-[#1e1e1e] rounded p-2">
                    {action}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No recent dosing actions</p>
            )}
          </div>
          
          <div className="border-t border-[#333333] pt-4 mt-4">
            <h3 className="text-sm font-medium mb-2">Current Readings</h3>
            {status?.sensorReadings && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-[#1e1e1e] rounded p-2">
                  <span className="text-gray-400">pH: </span>
                  <span className="font-medium">{status.sensorReadings.ph.toFixed(2)}</span>
                </div>
                <div className="bg-[#1e1e1e] rounded p-2">
                  <span className="text-gray-400">EC: </span>
                  <span className="font-medium">{status.sensorReadings.ec.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <button 
              className="btn btn-secondary w-full" 
              onClick={manualCheck}
              disabled={isLoading}
            >
              Check Now
            </button>
          </div>
        </>
      )}
    </div>
  );
} 
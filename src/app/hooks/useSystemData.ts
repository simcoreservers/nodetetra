"use client";

import { useState, useEffect } from 'react';

export interface SystemInfo {
  version: string;
  lastUpdated: string;
  deviceId: string;
  deviceName: string;
  uptime: string;
}

export interface NetworkInfo {
  hostname: string;
  ipAddress: string;
  macAddress: string;
  connectionType: string;
  ssid: string;
  signalStrength: string;
}

export interface BackupInfo {
  lastBackup: string;
  backupLocation: string;
  autoBackup: boolean;
  backupFrequency: string;
}

export interface SystemData {
  systemInfo: SystemInfo;
  network: NetworkInfo;
  backup: BackupInfo;
  timestamp: string;
}

interface UseSystemDataProps {
  refreshInterval?: number;
}

export function useSystemData({ refreshInterval = 30000 }: UseSystemDataProps = {}) {
  const [data, setData] = useState<SystemData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSystemData = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, this would be a fetch to your API
      const response = await fetch('/api/system');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      setData(responseData);
      setError(null);
    } catch (err) {
      console.error('Error fetching system data:', err);
      
      // For development purposes, return mock data if the API isn't implemented yet
      // REMOVE THIS IN PRODUCTION
      setData({
        systemInfo: {
          version: "1.0.2",
          lastUpdated: "2023-09-15",
          deviceId: "NutetraX2023092",
          deviceName: "Main Hydroponic System",
          uptime: "15 days, 7 hours, 32 minutes"
        },
        network: {
          hostname: "nutetra.local",
          ipAddress: "192.168.1.100",
          macAddress: "A1:B2:C3:D4:E5:F6",
          connectionType: "WiFi",
          ssid: "Greenhouse_Network",
          signalStrength: "Excellent"
        },
        backup: {
          lastBackup: "2023-09-19 08:30",
          backupLocation: "Cloud Storage",
          autoBackup: true,
          backupFrequency: "Daily"
        },
        timestamp: new Date().toISOString()
      });
      
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Update system information
  const updateSystemInfo = async (updates: Partial<SystemInfo>) => {
    try {
      // In a real implementation, this would be a POST to your API
      const response = await fetch('/api/system/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update system info: ${response.statusText}`);
      }
      
      // Refresh data after successful update
      fetchSystemData();
      return true;
    } catch (err) {
      console.error('Error updating system info:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Update network settings
  const updateNetworkSettings = async (updates: Partial<NetworkInfo>) => {
    try {
      // In a real implementation, this would be a POST to your API
      const response = await fetch('/api/system/network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update network settings: ${response.statusText}`);
      }
      
      // Refresh data after successful update
      fetchSystemData();
      return true;
    } catch (err) {
      console.error('Error updating network settings:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Update backup settings
  const updateBackupSettings = async (updates: Partial<BackupInfo>) => {
    try {
      // In a real implementation, this would be a POST to your API
      const response = await fetch('/api/system/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update backup settings: ${response.statusText}`);
      }
      
      // Refresh data after successful update
      fetchSystemData();
      return true;
    } catch (err) {
      console.error('Error updating backup settings:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // System commands
  const restartSystem = async () => {
    try {
      const response = await fetch('/api/system/restart', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to restart system: ${response.statusText}`);
      }
      
      return true;
    } catch (err) {
      console.error('Error restarting system:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchSystemData();
  }, []);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchSystemData();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchSystemData,
    updateSystemInfo,
    updateNetworkSettings,
    updateBackupSettings,
    restartSystem
  };
} 
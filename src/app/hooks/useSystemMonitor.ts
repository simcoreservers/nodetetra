'use client';

import { useState, useEffect } from 'react';

export interface SystemMonitorData {
  cpu: {
    model: string;
    cores: number;
    usage: number;
  };
  memory: {
    total: string;
    used: string;
    free: string;
    usage: number;
  };
  system: {
    platform: string;
    hostname: string;
    uptime: string;
    type: string;
    architecture: string;
  };
  timestamp: string;
}

interface UseSystemMonitorProps {
  refreshInterval?: number;
}

export function useSystemMonitor({ refreshInterval = 5000 }: UseSystemMonitorProps = {}) {
  const [data, setData] = useState<SystemMonitorData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSystemMonitor = async () => {
    try {
      const response = await fetch('/api/system');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      setData(responseData);
      setError(null);
    } catch (err) {
      console.error('Error fetching system monitor data:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchSystemMonitor();
  }, []);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchSystemMonitor();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchSystemMonitor
  };
} 
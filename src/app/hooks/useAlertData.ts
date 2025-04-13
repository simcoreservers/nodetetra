import { useState, useEffect } from 'react';
import { Alert, AlertSettings, ThresholdSettings } from '@/app/lib/alerts';

export interface AlertData {
  activeAlerts?: Alert[];
  alertSettings?: AlertSettings;
  thresholdSettings?: ThresholdSettings;
  timestamp: string;
}

interface UseAlertDataProps {
  mode?: 'active' | 'history' | 'resolved' | 'settings' | 'thresholds' | 'all';
  limit?: number;
  refreshInterval?: number;
}

/**
 * Custom hook for fetching and managing alert data
 */
export function useAlertData({
  mode = 'active',
  limit = 20,
  refreshInterval = 10000
}: UseAlertDataProps = {}) {
  const [data, setData] = useState<AlertData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Build the URL with query parameters
        const url = new URL('/api/alerts', window.location.origin);
        url.searchParams.append('mode', mode);
        if (mode === 'history' && limit) {
          url.searchParams.append('limit', limit.toString());
        }
        
        const response = await fetch(url.toString());
        const responseData = await response.json();
        
        if (!response.ok || responseData.status === 'error') {
          throw new Error(responseData.error || `Alert API error: ${response.status}`);
        }
        
        if (isMounted) {
          setData({
            ...responseData.data,
            timestamp: responseData.timestamp
          });
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          // Schedule next update
          timeoutId = setTimeout(fetchData, refreshInterval);
        }
      }
    };

    // Initial fetch
    fetchData();

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [mode, limit, refreshInterval]);

  // Acknowledge an alert
  const acknowledgeAlert = async (alertId: number) => {
    try {
      const url = new URL('/api/alerts', window.location.origin);
      url.searchParams.append('action', 'acknowledge');
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alertId }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        throw new Error(responseData.error || `Failed to acknowledge alert: ${response.status}`);
      }
      
      // Update the local state if successful
      if (data?.activeAlerts) {
        const updatedAlerts = data.activeAlerts.map(alert => 
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        );
        
        setData({
          ...data,
          activeAlerts: updatedAlerts,
          timestamp: responseData.timestamp
        });
      }
      
      return responseData.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  // Resolve an alert
  const resolveAlert = async (alertId: number) => {
    try {
      const url = new URL('/api/alerts', window.location.origin);
      url.searchParams.append('action', 'resolve');
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alertId }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        throw new Error(responseData.error || `Failed to resolve alert: ${response.status}`);
      }
      
      // Update the local state if successful
      if (data?.activeAlerts) {
        // Remove the resolved alert from active alerts
        const updatedAlerts = data.activeAlerts.filter(alert => alert.id !== alertId);
        
        setData({
          ...data,
          activeAlerts: updatedAlerts,
          timestamp: responseData.timestamp
        });
      }
      
      return responseData.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  // Update alert settings
  const updateSettings = async (settings: Partial<AlertSettings>) => {
    try {
      const url = new URL('/api/alerts', window.location.origin);
      url.searchParams.append('action', 'updateSettings');
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        throw new Error(responseData.error || `Failed to update settings: ${response.status}`);
      }
      
      // Update the local state if successful
      if (data) {
        setData({
          ...data,
          alertSettings: responseData.data,
          timestamp: responseData.timestamp
        });
      }
      
      return responseData.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  // Update threshold settings
  const updateThresholds = async (thresholds: Partial<ThresholdSettings>) => {
    try {
      const url = new URL('/api/alerts', window.location.origin);
      url.searchParams.append('action', 'updateThresholds');
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(thresholds),
      });
      
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        throw new Error(responseData.error || `Failed to update thresholds: ${response.status}`);
      }
      
      // Update the local state if successful
      if (data) {
        setData({
          ...data,
          thresholdSettings: responseData.data,
          timestamp: responseData.timestamp
        });
      }
      
      return responseData.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  // Manual refresh function
  const refresh = async () => {
    setIsLoading(true);
    try {
      // Build the URL with query parameters
      const url = new URL('/api/alerts', window.location.origin);
      url.searchParams.append('mode', mode);
      if (mode === 'history' && limit) {
        url.searchParams.append('limit', limit.toString());
      }
      
      const response = await fetch(url.toString());
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        throw new Error(responseData.error || `Alert API error: ${response.status}`);
      }
      
      setData({
        ...responseData.data,
        timestamp: responseData.timestamp
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return { 
    data, 
    isLoading, 
    error, 
    refresh,
    acknowledgeAlert,
    resolveAlert,
    updateSettings,
    updateThresholds
  };
} 
import { useState, useEffect } from 'react';
import { SensorData } from '@/app/lib/sensors';

export interface SensorError {
  message: string;
  type: 'connection' | 'reading' | 'unknown';
  timestamp: string;
}

/**
 * Custom hook for fetching and managing real-time sensor data
 * @param refreshInterval - How often to poll for new data (in ms)
 */
export function useSensorData(refreshInterval = 1000) {
  const [data, setData] = useState<SensorData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<SensorError | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/sensors');
        const responseData = await response.json();
        
        if (!response.ok || responseData.status === 'error') {
          // Handle API-returned errors
          throw new Error(responseData.error || `Sensor API error: ${response.status}`);
        }
        
        if (isMounted) {
          setData(responseData);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          
          // Parse API error response if available
          let errorType: 'connection' | 'reading' | 'unknown' = 'unknown';
          
          if (errorMessage.includes('connection error') || errorMessage.includes('Failed to fetch')) {
            errorType = 'connection';
          } else if (errorMessage.includes('reading error')) {
            errorType = 'reading';
          }
          
          setError({
            message: errorMessage,
            type: errorType,
            timestamp: new Date().toISOString()
          });
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
  }, [refreshInterval]);

  // Manual refresh function
  const refresh = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sensors');
      const responseData = await response.json();
      
      if (!response.ok || responseData.status === 'error') {
        // Handle API-returned errors
        throw new Error(responseData.error || `Sensor API error: ${response.status}`);
      }
      
      setData(responseData);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Parse API error response if available
      let errorType: 'connection' | 'reading' | 'unknown' = 'unknown';
      
      if (errorMessage.includes('connection error') || errorMessage.includes('Failed to fetch')) {
        errorType = 'connection';
      } else if (errorMessage.includes('reading error')) {
        errorType = 'reading';
      }
      
      setError({
        message: errorMessage,
        type: errorType,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, refresh };
} 
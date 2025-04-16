import { useState, useEffect, useRef } from 'react';
import { SensorData } from '@/app/lib/sensors';

export interface SensorError {
  message: string;
  type: 'connection' | 'reading' | 'unknown';
  timestamp: string;
}

interface UseSensorDataOptions {
  refreshInterval?: number;
  disabled?: boolean;
  debugName?: string; // For debugging - component name using this hook
}

// Global counter of hook instances and request counter
let hookInstanceCounter = 0;
const requestCounts: Record<string, number> = {};

/**
 * Custom hook for fetching and managing sensor data
 * @param options - Configuration options:
 *   - refreshInterval: How often to poll for new data (in ms), 0 to disable automatic polling
 *   - disabled: Set to true to completely disable the hook from making any API calls
 *   - debugName: Optional name for debugging which component is using this hook
 */
export function useSensorData(refreshIntervalOrOptions: number | UseSensorDataOptions = 1000) {
  // Parse options
  const options: UseSensorDataOptions = typeof refreshIntervalOrOptions === 'number' 
    ? { refreshInterval: refreshIntervalOrOptions } 
    : refreshIntervalOrOptions;
  
  const { refreshInterval = 1000, disabled = false, debugName = '' } = options;
  
  // Generate a unique ID for this hook instance for debugging
  const hookId = useRef(`sensor-hook-${++hookInstanceCounter}${debugName ? `-${debugName}` : ''}`);
  
  const [data, setData] = useState<SensorData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!disabled);
  const [error, setError] = useState<SensorError | null>(null);
  
  // Use a ref to track if a fetch is in progress to prevent overlap
  const fetchInProgress = useRef(false);
  
  // For debugging request frequency
  const requestCount = useRef(0);
  const lastLogTime = useRef(0);

  // Log hook initialization for debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SensorHook] ${hookId.current} initialized with interval ${refreshInterval}ms, disabled=${disabled}`);
      
      return () => {
        console.log(`[SensorHook] ${hookId.current} unmounted`);
      };
    }
  }, [refreshInterval, disabled]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchData = async () => {
      // Skip if disabled or another fetch is in progress
      if (disabled || fetchInProgress.current) return;
      
      // For debugging request frequency
      requestCount.current++;
      
      // Log every 10 requests to avoid console spam
      if (process.env.NODE_ENV === 'development' && requestCount.current % 10 === 0) {
        const now = Date.now();
        if (!requestCounts[hookId.current]) requestCounts[hookId.current] = 0;
        requestCounts[hookId.current]++;
        
        if (now - lastLogTime.current > 5000) {
          console.log(`[SensorHook] Request counts:`, requestCounts);
          lastLogTime.current = now;
        }
      }
      
      try {
        // Mark fetch as in progress
        fetchInProgress.current = true;
        setIsLoading(true);
        
        // Add debugging info to help trace excessive calls
        const headers = new Headers();
        headers.append('X-Debug-Hook-ID', hookId.current);
        
        const response = await fetch('/api/sensors', { headers });
        
        // Check if the response is ok before trying to parse it
        if (!response.ok) {
          throw new Error(`Sensor API HTTP error: ${response.status}`);
        }
        
        // Parse the JSON response
        const responseData = await response.json();
        
        // Check if the API returned an error status
        if (responseData.status === 'error') {
          throw new Error(responseData.error || `Sensor API returned error status`);
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
        // Clear the in-progress flag
        fetchInProgress.current = false;
        
        if (isMounted) {
          setIsLoading(false);
          
          // Schedule next update if refreshInterval > 0 and not disabled
          if (refreshInterval > 0 && !disabled) {
            timeoutId = setTimeout(fetchData, refreshInterval);
          }
        }
      }
    };

    // Initial fetch only if not disabled
    if (!disabled) {
      fetchData();
    } else {
      // If disabled, make sure we're not loading
      setIsLoading(false);
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [refreshInterval, disabled]);

  // Manual refresh function that respects disabled state
  const refresh = async () => {
    if (disabled || fetchInProgress.current) return null;
    
    // For debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SensorHook] ${hookId.current} manual refresh called`);
    }
    
    setIsLoading(true);
    fetchInProgress.current = true;
    
    try {
      const response = await fetch('/api/sensors');
      
      if (!response.ok) {
        throw new Error(`Sensor API HTTP error: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.status === 'error') {
        throw new Error(responseData.error || `Sensor API returned error status`);
      }
      
      setData(responseData);
      setError(null);
      return responseData;
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
      return null;
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  };

  return { data, isLoading, error, refresh };
} 
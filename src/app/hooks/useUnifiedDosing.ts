import { useState, useEffect, useCallback, useRef } from 'react';

interface UseUnifiedDosingProps {
  refreshInterval?: number;
}

export function useUnifiedDosing({ refreshInterval = 5000 }: UseUnifiedDosingProps = {}) {
  const [config, setConfig] = useState<any>(null);
  const [lastDosingResult, setLastDosingResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isDosingInProgress, setIsDosingInProgress] = useState<boolean>(false);
  const [lastDosingAttemptTime, setLastDosingAttemptTime] = useState<number>(0);
  
  // Use ref for polling interval
  const currentIntervalRef = useRef<number>(refreshInterval);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dosing');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error fetching dosing config');
      }
      
      setConfig(data.config);
      setIsDosingInProgress(data.isDosingInProgress || false);
      setError(null);
    } catch (err) {
      console.error('Error fetching dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (updates: any) => {
    try {
      setIsLoading(true);
      
      // Optimistic update
      if (config) {
        setConfig({...config, ...updates});
      }
      
      const response = await fetch('/api/dosing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          config: updates
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error updating dosing config');
      }
      
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Roll back optimistic update
      fetchConfig();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchConfig]);

  const toggleEnabled = useCallback(async () => {
    if (!config) return false;
    
    const action = config.enabled ? 'disable' : 'enable';
    
    try {
      setIsLoading(true);
      
      // Optimistic update
      setConfig({...config, enabled: !config.enabled});
      
      const response = await fetch('/api/dosing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action,
          // Add a force flag when enabling to make API force a clean restart
          ...(action === 'enable' ? { forceReset: true } : {})
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} dosing: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || `Unknown error during ${action} dosing`);
      }
      
      // Update config with the returned state to ensure UI reflects server state
      if (data.config) {
        setConfig(data.config);
      }
      
      // Force monitoring to stop if disabling
      if (action === 'disable') {
        // Send an extra request to ensure monitoring is stopped
        await fetch('/api/dosing/force-stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }).catch(err => console.error('Error forcing monitoring stop:', err));
      } else if (action === 'enable') {
        // When enabling, double-check status after a short delay
        setTimeout(() => {
          fetchConfig();
        }, 1000);
        
        // Add a second verification after slightly longer delay
        setTimeout(() => {
          fetchConfig();
        }, 3000);
      }
      
      setError(null);
      return true;
    } catch (err) {
      console.error(`Error toggling dosing (${action}):`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Roll back optimistic update
      fetchConfig();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchConfig]);

  const resetConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/dosing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to reset dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error resetting dosing config');
      }
      
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error resetting dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const triggerAutoDosing = useCallback(async () => {
    try {
      // Rate limiting
      const now = Date.now();
      if (now - lastDosingAttemptTime < 2000) {
        return {
          action: 'waiting',
          details: { reason: 'Please wait before attempting another dosing operation' }
        };
      }
      setLastDosingAttemptTime(now);
      
      // Check if already in progress
      if (isDosingInProgress) {
        return {
          action: 'waiting',
          details: { reason: 'A dosing operation is already in progress' }
        };
      }
      
      // Optimistic update
      setIsDosingInProgress(true);
      setIsLoading(true);
      
      const response = await fetch('/api/dosing/auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'dose' }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to trigger dosing: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error triggering dosing');
      }
      
      // Schedule refresh after short delay
      setTimeout(() => {
        fetchConfig();
      }, 2000);
      
      setLastDosingResult(data.result);
      setError(null);
      return data.result;
    } catch (err) {
      console.error('Error triggering dosing:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Reset in-progress state
      setIsDosingInProgress(false);
      return {
        action: 'error',
        details: { reason: String(err) }
      };
    } finally {
      setIsLoading(false);
    }
  }, [isDosingInProgress, fetchConfig, lastDosingAttemptTime]);
  
  const manualDosing = useCallback(async (pumpName: string, amount: number, flowRate?: number) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/dosing/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pumpName, amount, flowRate }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to dispense from ${pumpName}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error during manual dosing');
      }
      
      // Refresh after short delay
      setTimeout(() => {
        fetchConfig();
      }, 2000);
      
      return data.result;
    } catch (err) {
      console.error('Error during manual dosing:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return { 
        action: 'error',
        details: { reason: String(err) }
      };
    } finally {
      setIsLoading(false);
    }
  }, [fetchConfig]);
  
  const updateTargets = useCallback(async (targets: { ph?: any, ec?: any }) => {
    try {
      setIsLoading(true);
      
      // Optimistic update
      if (config) {
        setConfig({
          ...config,
          targets: {
            ...config.targets,
            ...(targets.ph ? { ph: { ...config.targets.ph, ...targets.ph }} : {}),
            ...(targets.ec ? { ec: { ...config.targets.ec, ...targets.ec }} : {})
          }
        });
      }
      
      const response = await fetch('/api/dosing/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(targets),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update targets: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error updating targets');
      }
      
      // Update config with the returned targets
      if (config) {
        setConfig({
          ...config,
          targets: data.targets
        });
      }
      
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating targets:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Roll back optimistic update
      fetchConfig();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config, fetchConfig]);
  
  const calibratePump = useCallback(async (pumpName: string, flowRate: number) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/dosing/calibration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pumpName, flowRate }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to calibrate ${pumpName}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error during calibration');
      }
      
      // Refresh config to get updated pump settings
      fetchConfig();
      
      return true;
    } catch (err) {
      console.error('Error calibrating pump:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchConfig]);

  // Initial fetch
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Slow down polling when tab inactive
        currentIntervalRef.current = 30000;
        
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = setInterval(fetchConfig, currentIntervalRef.current);
        }
        
        // Before leaving tab, store info that dosing process might be in progress 
        if (isDosingInProgress) {
          try {
            localStorage.setItem('autoDosing_inProgress', 'true');
            localStorage.setItem('autoDosing_timestamp', Date.now().toString());
          } catch (err) {
            console.error('Failed to store auto-dosing state in localStorage', err);
          }
        }
      } else {
        // Resume normal polling when tab active
        currentIntervalRef.current = refreshInterval;
        
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = setInterval(fetchConfig, currentIntervalRef.current);
          // Fetch immediately when tab becomes visible
          fetchConfig().then(() => {
            // Check if there was an in-progress operation when tab was hidden
            try {
              const wasInProgress = localStorage.getItem('autoDosing_inProgress') === 'true';
              const timestamp = localStorage.getItem('autoDosing_timestamp');
              
              if (wasInProgress && timestamp) {
                const timePassed = Date.now() - parseInt(timestamp);
                // If it's been more than 60 seconds, fetch one more time to ensure we have latest state
                if (timePassed > 60000) {
                  setTimeout(fetchConfig, 1000);
                }
              }
              
              // Clear the storage regardless
              localStorage.removeItem('autoDosing_inProgress');
              localStorage.removeItem('autoDosing_timestamp');
            } catch (err) {
              console.error('Error checking auto-dosing persistence state', err);
            }
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshInterval, fetchConfig, isDosingInProgress]);

  // Set up polling interval
  useEffect(() => {
    currentIntervalRef.current = document.hidden ? 30000 : refreshInterval;
    
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    
    intervalIdRef.current = setInterval(fetchConfig, currentIntervalRef.current);
    
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [refreshInterval, fetchConfig]);

  return {
    config,
    lastDosingResult,
    isLoading,
    error,
    isDosingInProgress,
    refresh: fetchConfig,
    updateConfig,
    toggleEnabled,
    resetConfig,
    triggerAutoDosing,
    manualDosing,
    updateTargets,
    calibratePump
  };
}

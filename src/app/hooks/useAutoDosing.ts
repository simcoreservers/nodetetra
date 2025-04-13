import { useState, useEffect, useCallback } from 'react';
import { DosingConfig } from '@/app/lib/autoDosing';

interface UseAutoDosingProps {
  refreshInterval?: number;
}

export function useAutoDosing({ refreshInterval = 30000 }: UseAutoDosingProps = {}) {
  const [config, setConfig] = useState<DosingConfig | null>(null);
  const [lastDosingResult, setLastDosingResult] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/autodosing');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch auto-dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error fetching auto-dosing config');
      }
      
      setConfig(data.config);
      setError(null);
    } catch (err) {
      console.error('Error fetching auto-dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (updates: Partial<DosingConfig>) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/autodosing', {
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
        throw new Error(`Failed to update auto-dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error updating auto-dosing config');
      }
      
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating auto-dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleEnabled = useCallback(async () => {
    if (!config) return false;
    
    const action = config.enabled ? 'disable' : 'enable';
    
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/autodosing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} auto-dosing: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || `Unknown error during ${action} auto-dosing`);
      }
      
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      console.error(`Error toggling auto-dosing (${action}):`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const resetConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/autodosing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to reset auto-dosing config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error resetting auto-dosing config');
      }
      
      setConfig(data.config);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error resetting auto-dosing config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const triggerDosing = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/autodosing', {
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
      
      setLastDosingResult(data.result);
      setError(null);
      return data.result;
    } catch (err) {
      console.error('Error triggering dosing:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchConfig();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchConfig]);

  return {
    config,
    lastDosingResult,
    isLoading,
    error,
    refresh: fetchConfig,
    updateConfig,
    toggleEnabled,
    resetConfig,
    triggerDosing
  };
} 
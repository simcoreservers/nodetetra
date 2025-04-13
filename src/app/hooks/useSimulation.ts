import { useState, useEffect } from 'react';
import { SimulationConfig } from '@/app/lib/simulation';

interface UseSimulationProps {
  refreshInterval?: number;
}

export function useSimulation({ refreshInterval = 30000 }: UseSimulationProps = {}) {
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSimulationConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/simulation');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch simulation config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error fetching simulation config');
      }
      
      setConfig(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching simulation config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const updateSimulationConfig = async (updates: Partial<SimulationConfig> & { reset?: boolean }) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update simulation config: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.error || 'Unknown error updating simulation config');
      }
      
      setConfig(data);
      setError(null);
      return true;
    } catch (err) {
      console.error('Error updating simulation config:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle simulation enabled/disabled
  const toggleSimulation = async () => {
    if (!config) return false;
    
    return await updateSimulationConfig({
      enabled: !config.enabled
    });
  };

  // Reset simulation to baseline values
  const resetSimulation = async () => {
    return await updateSimulationConfig({
      reset: true
    });
  };

  // Initial data fetch
  useEffect(() => {
    fetchSimulationConfig();
  }, []);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchSimulationConfig();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return {
    config,
    isLoading,
    error,
    refresh: fetchSimulationConfig,
    updateSimulationConfig,
    toggleSimulation,
    resetSimulation
  };
} 
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { SimulationConfig } from '@/app/lib/simulation';
import { useSimulation } from '@/app/hooks/useSimulation';

// Define the shape of the context
interface SimulationContextType {
  config: SimulationConfig | null;
  isLoading: boolean;
  error: Error | null;
  isEnabled: boolean;
  refresh: () => Promise<void>;
  updateSimulationConfig: (updates: Partial<SimulationConfig> & { reset?: boolean }) => Promise<boolean>;
  toggleSimulation: () => Promise<boolean>;
  resetSimulation: () => Promise<boolean>;
}

// Create the context with default values
const SimulationContext = createContext<SimulationContextType>({
  config: null,
  isLoading: false,
  error: null,
  isEnabled: false,
  refresh: async () => {},
  updateSimulationConfig: async () => false,
  toggleSimulation: async () => false,
  resetSimulation: async () => false
});

// Export a hook to use the simulation context
export const useSimulationContext = () => useContext(SimulationContext);

// Props for the provider component
interface SimulationProviderProps {
  children: ReactNode;
  refreshInterval?: number;
}

// Provider component to wrap the app with
export function SimulationProvider({ 
  children, 
  refreshInterval = 30000 
}: SimulationProviderProps) {
  // Use the useSimulation hook to fetch and manage simulation state
  const { 
    config, 
    isLoading, 
    error, 
    refresh, 
    updateSimulationConfig, 
    toggleSimulation, 
    resetSimulation 
  } = useSimulation({ refreshInterval });

  // Computed value for whether simulation is enabled
  const isEnabled = config?.enabled || false;

  // Context value to provide to consumers
  const contextValue: SimulationContextType = {
    config,
    isLoading,
    error,
    isEnabled,
    refresh,
    updateSimulationConfig,
    toggleSimulation,
    resetSimulation
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
} 
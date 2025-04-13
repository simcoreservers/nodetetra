"use client";

import { useState, useEffect, useCallback } from 'react';
import { PumpStatus, PumpEvent, PumpName } from '../lib/pumps';

interface PumpData {
  pumpStatus: PumpStatus[];
  recentEvents: PumpEvent[];
}

interface PumpError {
  message: string;
  type: 'connection' | 'hardware' | 'unknown';
  timestamp: number;
}

export interface NutrientAssignment {
  productId: number;
  brandId: number;
  brandName: string;
  productName: string;
  npk: string;
}

export function usePumpData(refreshInterval: number = 0) {
  const [data, setData] = useState<PumpData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<PumpError | null>(null);

  const fetchPumpData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/pumps');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const pumpData = await response.json();
      setData(pumpData);
      
    } catch (err) {
      console.error('Error fetching pump data:', err);
      setError({
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        type: 'connection',
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Function to activate a pump via API
  const activatePump = async (pumpName: PumpName) => {
    try {
      const response = await fetch('/api/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'activate', pumpName }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to activate pump: ${response.statusText}`);
      }
      
      // Refresh pump data after activation
      fetchPumpData();
      return true;
    } catch (err) {
      console.error(`Error activating pump ${pumpName}:`, err);
      setError({
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        type: 'hardware',
        timestamp: Date.now(),
      });
      return false;
    }
  };
  
  // Function to deactivate a pump via API
  const deactivatePump = async (pumpName: PumpName) => {
    try {
      const response = await fetch('/api/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'deactivate', pumpName }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to deactivate pump: ${response.statusText}`);
      }
      
      // Refresh pump data after deactivation
      fetchPumpData();
      return true;
    } catch (err) {
      console.error(`Error deactivating pump ${pumpName}:`, err);
      setError({
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        type: 'hardware',
        timestamp: Date.now(),
      });
      return false;
    }
  };
  
  // Function to dispense a specific amount from a pump
  const dispensePump = async (pumpName: PumpName, amount: number, flowRate: number) => {
    try {
      const response = await fetch('/api/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'dispense', 
          pumpName,
          amount,
          flowRate 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to dispense from pump: ${response.statusText}`);
      }
      
      // Refresh pump data after dispensing
      fetchPumpData();
      return true;
    } catch (err) {
      console.error(`Error dispensing from pump ${pumpName}:`, err);
      setError({
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        type: 'hardware',
        timestamp: Date.now(),
      });
      return false;
    }
  };
  
  // Function to assign a nutrient to a pump
  const assignNutrientToPump = async (pumpName: PumpName, nutrient: NutrientAssignment | null) => {
    try {
      const response = await fetch('/api/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'assignNutrient', 
          pumpName,
          nutrient
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to assign nutrient to pump: ${response.statusText}`);
      }
      
      // Refresh pump data after assignment
      fetchPumpData();
      return true;
    } catch (err) {
      console.error(`Error assigning nutrient to pump ${pumpName}:`, err);
      setError({
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        type: 'hardware',
        timestamp: Date.now(),
      });
      return false;
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchPumpData();
  }, [fetchPumpData]);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchPumpData();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchPumpData]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchPumpData,
    activatePump,
    deactivatePump,
    dispensePump,
    assignNutrientToPump
  };
} 
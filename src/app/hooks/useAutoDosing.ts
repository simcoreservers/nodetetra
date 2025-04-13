'use client';

import { useState, useEffect, useCallback } from 'react';
import { SensorData } from '@/app/lib/sensors';

interface AutoDosingStatus {
  dosingActions: string[];
  sensorReadings: SensorData;
  isAutoEnabled: boolean;
  message: string;
  timestamp: string;
  lastCheck?: string;
  nextCheck?: string;
}

export function useAutoDosing(refreshInterval = 60000) {
  const [status, setStatus] = useState<AutoDosingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Fetching auto-dosing status...');
      const response = await fetch('/api/auto-dosing');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error('Error checking auto-dosing status:', err);
      if (err instanceof Error) {
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
      }
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkStatus();
    
    // Set up interval for refreshing
    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        checkStatus();
      }, refreshInterval);
      
      return () => clearInterval(intervalId);
    }
  }, [checkStatus, refreshInterval]);

  const manualCheck = async () => {
    await checkStatus();
  };

  return {
    status,
    isLoading,
    error,
    manualCheck
  };
} 
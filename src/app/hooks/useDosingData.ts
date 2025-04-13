"use client";

import { useState, useEffect } from 'react';

export interface PhEcRange {
  min: number;
  max: number;
  current: number;
}

export interface DosingHistoryEntry {
  timestamp: string;
  action: string;
  details: string;
}

export interface DosingSettings {
  targetPh: PhEcRange;
  targetEc: PhEcRange;
  dosingSchedule: 'Continuous' | 'Timed' | 'Scheduled';
  dosingLimits: {
    phUp: number;
    phDown: number;
    nutrientA: number;
    nutrientB: number;
  };
  timestamp: string;
}

export interface DosingSchedule {
  time: string;
  days: string[];
  enabled: boolean;
}

export interface DosingData {
  settings: DosingSettings;
  history: DosingHistoryEntry[];
}

interface UseDosingDataProps {
  refreshInterval?: number;
}

export function useDosingData({ refreshInterval = 30000 }: UseDosingDataProps = {}) {
  const [data, setData] = useState<DosingData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  // Fetch active profile
  const fetchActiveProfile = async () => {
    try {
      const response = await fetch('/api/profiles/active');
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn('No active profile found, using default values');
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const profileData = await response.json();
      return profileData;
    } catch (err) {
      console.error('Error fetching active profile:', err);
      return null;
    }
  };

  const fetchDosingData = async () => {
    setIsLoading(true);
    try {
      // First fetch the active profile to get pH and EC ranges
      const profile = await fetchActiveProfile();
      setActiveProfile(profile);
      
      // In a real implementation, this would be a fetch to your API
      const response = await fetch('/api/dosing');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();

      // If we have an active profile, update the pH and EC target ranges from it
      if (profile) {
        responseData.settings.targetPh.min = profile.targetPh.min;
        responseData.settings.targetPh.max = profile.targetPh.max;
        responseData.settings.targetEc.min = profile.targetEc.min;
        responseData.settings.targetEc.max = profile.targetEc.max;
      }
      
      setData(responseData);
      setError(null);
    } catch (err) {
      console.error('Error fetching dosing data:', err);
      
      // For development purposes, return mock data if the API isn't implemented yet
      // REMOVE THIS IN PRODUCTION
      const profile = await fetchActiveProfile();
      setActiveProfile(profile);
      
      const mockData: DosingData = {
        settings: {
          targetPh: {
            min: profile ? profile.targetPh.min : 5.8,
            max: profile ? profile.targetPh.max : 6.2,
            current: 6.0
          },
          targetEc: {
            min: profile ? profile.targetEc.min : 1.2,
            max: profile ? profile.targetEc.max : 1.5,
            current: 1.35
          },
          dosingSchedule: "Continuous",
          dosingLimits: {
            phUp: 50,
            phDown: 50,
            nutrientA: 100,
            nutrientB: 100
          },
          timestamp: new Date().toISOString()
        },
        history: []
      };
      
      setData(mockData);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Update dosing schedule
  const updateDosingSchedule = async (schedule: 'Continuous' | 'Timed' | 'Scheduled') => {
    try {
      const response = await fetch('/api/dosing/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schedule }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update dosing schedule: ${response.statusText}`);
      }
      
      // Refresh data after successful update
      fetchDosingData();
      return true;
    } catch (err) {
      console.error('Error updating dosing schedule:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Update dosing limits
  const updateDosingLimits = async (limits: Partial<DosingSettings['dosingLimits']>) => {
    try {
      const response = await fetch('/api/dosing/limits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(limits),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update dosing limits: ${response.statusText}`);
      }
      
      // Refresh data after successful update
      fetchDosingData();
      return true;
    } catch (err) {
      console.error('Error updating dosing limits:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchDosingData();
  }, []);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchDosingData();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return {
    data,
    activeProfile,
    isLoading,
    error,
    refresh: fetchDosingData,
    updateDosingSchedule,
    updateDosingLimits
  };
} 
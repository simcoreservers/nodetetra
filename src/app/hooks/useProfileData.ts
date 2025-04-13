"use client";

import { useState, useEffect } from 'react';

export interface ProfileSettings {
  name: string;
  cropType: string;
  targetPh: {
    target: number;
    buffer: number;
    min?: number; // Keep for backward compatibility
    max?: number; // Keep for backward compatibility
  };
  targetEc: {
    target: number;
    buffer: number;
    min?: number; // Keep for backward compatibility
    max?: number; // Keep for backward compatibility
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
  growthSchedule?: any[]; // Store weekly growth schedule
  growthPhase?: string; // Current growth phase of the plant
  pumpAssignments?: {
    pumpName: string;
    dosage: number;
    nutrientId?: number;
    brandId?: number;
    productName?: string;
    brandName?: string;
    isAutoDosage?: boolean;
  }[];
}

interface UseProfileDataProps {
  refreshInterval?: number;
}

export function useProfileData({ refreshInterval = 60000 }: UseProfileDataProps = {}) {
  const [profiles, setProfiles] = useState<ProfileSettings[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeProfile, setActiveProfile] = useState<ProfileSettings | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

  const fetchProfiles = async (isPolling = false) => {
    if (!isPolling) {
      setIsLoading(true);
    }
    try {
      // In a real implementation, this would be a fetch to your API
      const response = await fetch('/api/profiles');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setProfiles(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching profiles:', err);
      
      // For development purposes, return mock data if the API isn't implemented yet
      // REMOVE THIS IN PRODUCTION
      setProfiles([
        {
          name: "Lettuce",
          cropType: "Leafy Greens",
          targetPh: { target: 6.0, buffer: 0.2, min: 5.8, max: 6.2 },
          targetEc: { target: 1.0, buffer: 0.2, min: 0.8, max: 1.2 },
          notes: "Best for butterhead and romaine varieties",
          createdAt: "2023-04-12T10:00:00Z",
          updatedAt: "2023-06-18T14:30:00Z"
        },
        {
          name: "Basil",
          cropType: "Herbs",
          targetPh: { target: 6.0, buffer: 0.5, min: 5.5, max: 6.5 },
          targetEc: { target: 1.3, buffer: 0.3, min: 1.0, max: 1.6 },
          notes: "Maintain higher temperatures for best results",
          createdAt: "2023-02-23T09:15:00Z",
          updatedAt: "2023-05-17T11:45:00Z"
        },
        {
          name: "Strawberry",
          cropType: "Fruit",
          targetPh: { target: 5.8, buffer: 0.3, min: 5.5, max: 6.2 },
          targetEc: { target: 1.5, buffer: 0.3, min: 1.2, max: 1.8 },
          createdAt: "2023-03-10T16:20:00Z",
          updatedAt: "2023-06-05T13:10:00Z"
        },
        {
          name: "Tomato",
          cropType: "Fruit",
          targetPh: { target: 6.0, buffer: 0.3, min: 5.8, max: 6.3 },
          targetEc: { target: 2.8, buffer: 0.8, min: 2.0, max: 3.5 },
          notes: "Increase EC during fruiting stage",
          createdAt: "2023-01-05T14:00:00Z",
          updatedAt: "2023-04-20T09:30:00Z"
        }
      ]);
      
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveProfile = async (isPolling = false) => {
    try {
      const response = await fetch('/api/profiles/active');
      
      if (!response.ok) {
        if (response.status === 404) {
          // No active profile set yet, this is acceptable
          setActiveProfile(null);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setActiveProfile(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching active profile:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const createProfile = async (profile: Omit<ProfileSettings, 'createdAt' | 'updatedAt'>) => {
    try {
      console.log("Creating profile with data:", JSON.stringify(profile));
      
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });
      
      if (!response.ok) {
        // Try to get detailed error message
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || response.statusText;
        } catch (e) {
          errorDetail = response.statusText;
        }
        
        console.error(`Failed to create profile: ${response.status} - ${errorDetail}`);
        throw new Error(`Failed to create profile: ${errorDetail}`);
      }
      
      // Refresh profiles after creating a new one
      await fetchProfiles();
      return true;
    } catch (err) {
      console.error('Error creating profile:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  const updateProfile = async (name: string, profile: Partial<Omit<ProfileSettings, 'createdAt' | 'updatedAt'>>) => {
    try {
      console.log(`Updating profile "${name}" with data:`, JSON.stringify(profile));
      
      const response = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });
      
      if (!response.ok) {
        // Try to get detailed error message
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || response.statusText;
        } catch (e) {
          errorDetail = response.statusText;
        }
        
        console.error(`Failed to update profile: ${response.status} - ${errorDetail}`);
        throw new Error(`Failed to update profile: ${errorDetail}`);
      }
      
      // Refresh profiles after update
      await fetchProfiles();
      return true;
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  const deleteProfile = async (name: string) => {
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete profile: ${response.statusText}`);
      }
      
      // Refresh profiles after deletion
      fetchProfiles();
      return true;
    } catch (err) {
      console.error('Error deleting profile:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  const activateProfile = async (name: string) => {
    try {
      const response = await fetch('/api/profiles/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileName: name }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to activate profile: ${response.statusText}`);
      }
      
      // Refresh profiles and active profile after activation
      await fetchProfiles();
      await fetchActiveProfile();
      return true;
    } catch (err) {
      console.error('Error activating profile:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchProfiles();
    fetchActiveProfile();
  }, []);

  // Set up interval for refreshing data if refreshInterval > 0
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchProfiles();
      fetchActiveProfile();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Combined refresh function to refresh both profiles and active profile
  const refreshAll = async () => {
    await fetchProfiles();
    await fetchActiveProfile();
  };

  return {
    profiles,
    activeProfile,
    isLoading,
    error,
    refresh: refreshAll,
    createProfile,
    updateProfile,
    deleteProfile,
    activateProfile
  };
} 
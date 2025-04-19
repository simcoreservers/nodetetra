"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AutoDosingStatusCardProps {
  className?: string;
}

interface AutoDosingStatus {
  enabled: boolean;
  running: boolean;
  initialized: boolean;
  in_cooldown?: boolean;
  cooldown_remaining?: number;
  last_check_time?: number;
  last_dosing_time?: number;
  config?: {
    check_interval: number;
    dosing_cooldown: number;
    between_dose_delay: number;
    ph_tolerance: number;
    ec_tolerance: number;
  };
}

export default function AutoDosingStatusCard({ className = "" }: AutoDosingStatusCardProps) {
  const [status, setStatus] = useState<AutoDosingStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);

  // Fetch auto dosing status
  const fetchStatus = async () => {
    try {
      setError(null);
      const response = await fetch("/api/dosing/auto");
      
      if (!response.ok) {
        throw new Error(`Failed to fetch auto dosing status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === "success" && data.data) {
        setStatus(data.data);
      } else {
        throw new Error(data.error || "Unknown error fetching auto dosing status");
      }
    } catch (err) {
      console.error("Error fetching auto dosing status:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Toggle auto dosing
  const toggleAutoDosing = async () => {
    if (!status || toggling) return;
    
    try {
      setToggling(true);
      
      const action = status.enabled ? "disable" : "enable";
      const response = await fetch("/api/dosing/auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} auto dosing: ${response.status}`);
      }
      
      // Optimistically update UI state
      setStatus((prev) => prev ? { ...prev, enabled: !prev.enabled } : null);
      
      // Refetch after a brief delay to get the actual state
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      console.error(`Error ${status.enabled ? "disabling" : "enabling"} auto dosing:`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(false);
    }
  };

  // Fetch status on component mount and every 10 seconds
  useEffect(() => {
    fetchStatus();
    
    const interval = setInterval(fetchStatus, 10000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Helper to format time
  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return "Never";
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  // Determine card status color based on auto dosing state
  const getStatusClass = () => {
    if (error) return "border-red-500";
    if (!status || loading) return "border-gray-500";
    if (status.enabled && status.running) return "border-green-500";
    if (status.enabled && !status.running) return "border-yellow-500";
    return "border-gray-500";
  };

  // Get status message
  const getStatusMessage = () => {
    if (error) return "Error";
    if (!status || loading) return "Loading...";
    if (status.enabled && status.running) {
      if (status.in_cooldown) {
        return `Active (Cooldown: ${Math.round(status.cooldown_remaining || 0)}s)`;
      }
      return "Active";
    }
    if (status.enabled && !status.running) return "Enabled (Not running)";
    return "Disabled";
  };

  return (
    <div className={`${className} bg-card rounded-lg border-l-4 ${getStatusClass()} shadow-md overflow-hidden`}>
      <div className="p-4">
        <h2 className="text-lg font-semibold flex items-center">
          <span className={`h-3 w-3 rounded-full mr-2 ${status?.enabled && status?.running ? 'bg-green-500' : 'bg-gray-500'}`}></span>
          Auto Dosing
        </h2>
        
        {loading ? (
          <div className="animate-pulse my-4">
            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2 mt-2"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 my-2">{error}</div>
        ) : (
          <div className="my-2">
            <div className="text-sm mb-2">
              <span className="font-medium">Status:</span> {getStatusMessage()}
            </div>
            
            {status && (
              <>
                <div className="text-sm mb-2">
                  <span className="font-medium">Last Check:</span> {formatTime(status.last_check_time)}
                </div>
                <div className="text-sm mb-2">
                  <span className="font-medium">Last Dosing:</span> {formatTime(status.last_dosing_time)}
                </div>
              </>
            )}
          </div>
        )}
        
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={toggleAutoDosing}
            disabled={loading || toggling || !!error}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${
              status?.enabled
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            } disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
          >
            {toggling ? (
              "Working..."
            ) : status?.enabled ? (
              "Disable"
            ) : (
              "Enable"
            )}
          </button>
          
          <Link href="/dosing?tab=auto" className="text-sm text-primary hover:underline">
            Settings →
          </Link>
        </div>
      </div>
    </div>
  );
} 
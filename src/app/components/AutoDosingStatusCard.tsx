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
        // Get the error message from the response if possible
        let errorMsg = `Failed to ${action} auto dosing: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMsg = `${errorMsg} - ${errorData.error}`;
          }
        } catch {}
        throw new Error(errorMsg);
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

  // Determine status indicator color
  const getStatusClass = () => {
    if (error) return "status-danger";
    if (!status || loading) return "";
    if (status.enabled && status.running) return "status-good";
    if (status.enabled && !status.running) return "status-warning";
    return "";
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
    <div className={`card ${className}`}>
      <div className="card-header">
        <h2 className="card-title">Auto Dosing</h2>
        <div className="sensor-status">
          <div className={`status-indicator ${getStatusClass()}`}></div>
          <span>{getStatusMessage()}</span>
        </div>
      </div>
      
      {loading ? (
        <div className="animate-pulse p-4">
          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2 mt-2"></div>
        </div>
      ) : error ? (
        <div className="text-red-500 p-4">{error}</div>
      ) : (
        <div className="p-4">
          {status && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-gray-400 text-sm">Last Check</span>
                  <div className="font-medium">{formatTime(status.last_check_time)}</div>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Last Dosing</span>
                  <div className="font-medium">{formatTime(status.last_dosing_time)}</div>
                </div>
              </div>
            </>
          )}
          
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={toggleAutoDosing}
              disabled={loading || toggling || !!error}
              className={`btn ${
                status?.enabled ? "btn-danger" : "btn-primary"
              } ${(loading || toggling || !!error) ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {toggling ? (
                "Working..."
              ) : status?.enabled ? (
                "Disable"
              ) : (
                "Enable"
              )}
            </button>
            
            <Link href="/dosing?tab=auto" className="btn btn-secondary text-sm">
              Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
} 
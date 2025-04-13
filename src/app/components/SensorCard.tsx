'use client';

import React, { memo } from 'react';
import Link from "next/link";
import { useSimulationContext } from "./SimulationContext";

interface SensorCardProps {
  title: string;
  value: string | null;
  target: string;
  status: "status-good" | "status-warning" | "status-danger";
  isLoading: boolean;
  hasError: boolean;
  calibrationPath: string;
}

const SensorCard = memo(function SensorCard({
  title,
  value,
  target,
  status,
  isLoading,
  hasError,
  calibrationPath
}: SensorCardProps) {
  // Get simulation context to check if simulation is enabled
  const { isEnabled: simulationEnabled } = useSimulationContext();
  
  // Hide error in simulation mode
  const showError = hasError && !simulationEnabled;
  
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        <div className="sensor-status">
          <div className={`status-indicator ${status}`}></div>
          <span>{status === "status-good" ? "Optimal" : status === "status-warning" ? "Warning" : "Critical"}</span>
        </div>
      </div>
      <div className="data-value">
        {isLoading ? (
          <span className="animate-pulse">Loading...</span>
        ) : showError ? (
          <span className="text-red-500">Sensor Error</span>
        ) : (
          value || 'N/A'
        )}
      </div>
      <div className="data-label">Target: {target}</div>
      <div className="mt-4">
        <Link href={calibrationPath} className="btn btn-secondary mr-2 text-sm">Calibrate</Link>
        <Link href="/logs" className="btn btn-secondary text-sm">History</Link>
      </div>
    </div>
  );
});

export default SensorCard; 
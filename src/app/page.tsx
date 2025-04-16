"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "./components/Sidebar";
import { useSidebar } from "./components/SidebarContext";
import { useSensorData } from "./hooks/useSensorData";
import { usePumpData } from "./hooks/usePumpData";
import { useProfileData } from "./hooks/useProfileData";
import { useStreamData } from "./hooks/useStreamData";
import { useSimulationContext } from "./components/SimulationContext";
import { SensorData } from "./lib/sensors";
import SensorCard from "./components/SensorCard";
import PumpStatusCard from "./components/PumpStatusCard";
import RecentActivityCard from "./components/RecentActivityCard";
import ActiveProfileCard from "./components/ActiveProfileCard";

export default function Home() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const { collapsed } = useSidebar();
  
  // Track initial loading state separately from refresh loading
  const [initialLoaded, setInitialLoaded] = useState(false);
  
  // Use the simulation context to check if simulation mode is enabled
  const { isEnabled: simulationEnabled } = useSimulationContext();
  
  // Use the stream data hook for real-time updates
  const { data: streamData, isConnected: streamConnected, error: streamError } = useStreamData();
  
  // Use the old hooks as fallback if streaming not working
  const { data: sensorData, isLoading: sensorsLoading, error: sensorError, refresh: refreshSensors } = useSensorData(0); // Only used as fallback
  const { data: pumpData, isLoading: pumpsLoading, error: pumpError, refresh: refreshPumps } = usePumpData(0); // Only used as fallback
  const { activeProfile, isLoading: profileLoading } = useProfileData({ 
    refreshInterval: 0, // No need to constantly refresh all profiles
    activeProfileRefreshInterval: 30000 // Refresh active profile every 30 seconds
  });
  
  // Use stream data if available, otherwise fall back to polling data
  const effectiveSensorData = streamData?.sensors || sensorData;
  const effectivePumpData = streamData?.pumps || pumpData;
  const effectiveSensorError = sensorError || (streamError ? { type: 'connection', message: streamError.message } : null);
  const effectiveStreamError = streamError || (!streamConnected && !streamData);
  
  // Set initial load state once data is first loaded
  useEffect(() => {
    if (effectiveSensorData && !initialLoaded) {
      setInitialLoaded(true);
    }
  }, [effectiveSensorData, initialLoaded]);
  
  // Initialize the system via API on component mount
  useEffect(() => {
    // Call the initialization API on startup
    fetch('/api/init').catch(error => {
      console.error('Failed to initialize systems:', error);
    });
  }, []);

  // Refresh all data function (only used if streaming fails)
  const refreshAllData = () => {
    if (!streamConnected) {
      refreshSensors();
      refreshPumps();
    }
  };

  // Format the timestamp if we have data
  const lastUpdate = effectiveSensorData?.timestamp 
    ? new Date(effectiveSensorData.timestamp).toLocaleTimeString() 
    : 'Loading...';
  
  // Calculate status indicators based on real-time values
  const phStatus = !effectiveSensorData ? "status-warning" : 
    activeProfile ? (
      // Use active profile's target ranges if available
      effectiveSensorData.ph < (activeProfile.targetPh.min || activeProfile.targetPh.target - activeProfile.targetPh.buffer) - 0.3 || 
      effectiveSensorData.ph > (activeProfile.targetPh.max || activeProfile.targetPh.target + activeProfile.targetPh.buffer) + 0.3
        ? "status-danger" 
        : (effectiveSensorData.ph < (activeProfile.targetPh.min || activeProfile.targetPh.target - activeProfile.targetPh.buffer) || 
           effectiveSensorData.ph > (activeProfile.targetPh.max || activeProfile.targetPh.target + activeProfile.targetPh.buffer)) 
          ? "status-warning" 
          : "status-good"
    ) : (
      // Fall back to default ranges if no active profile
      effectiveSensorData.ph < 5.5 || effectiveSensorData.ph > 6.5 
        ? "status-danger" 
        : (effectiveSensorData.ph < 5.8 || effectiveSensorData.ph > 6.2) 
          ? "status-warning" 
          : "status-good"
    );
  
  const ecStatus = !effectiveSensorData ? "status-warning" : 
    activeProfile ? (
      // Use active profile's target ranges if available
      effectiveSensorData.ec < (activeProfile.targetEc.min || activeProfile.targetEc.target - activeProfile.targetEc.buffer) - 0.3 || 
      effectiveSensorData.ec > (activeProfile.targetEc.max || activeProfile.targetEc.target + activeProfile.targetEc.buffer) + 0.3
        ? "status-danger" 
        : (effectiveSensorData.ec < (activeProfile.targetEc.min || activeProfile.targetEc.target - activeProfile.targetEc.buffer) || 
           effectiveSensorData.ec > (activeProfile.targetEc.max || activeProfile.targetEc.target + activeProfile.targetEc.buffer)) 
          ? "status-warning" 
          : "status-good"
    ) : (
      // Fall back to default ranges if no active profile
      effectiveSensorData.ec < 1.0 || effectiveSensorData.ec > 1.8 
        ? "status-danger" 
        : (effectiveSensorData.ec < 1.2 || effectiveSensorData.ec > 1.5) 
          ? "status-warning" 
          : "status-good"
    );
  
  const tempStatus = !effectiveSensorData ? "status-warning" : 
    effectiveSensorData.waterTemp < 18 || effectiveSensorData.waterTemp > 26 
      ? "status-danger" 
      : (effectiveSensorData.waterTemp < 20 || effectiveSensorData.waterTemp > 24) 
        ? "status-warning" 
        : "status-good";

  // Only show error if not in simulation mode
  const shouldShowSensorError = ((effectiveStreamError || effectiveSensorError) && !simulationEnabled) ? true : false;

  // Calculate current week for growth schedule if available
  // If we have a growthPhase, try to find that phase in the schedule
  let currentWeek = 1;
  let currentPhase = activeProfile?.growthPhase || '';
  
  if (activeProfile?.growthSchedule && activeProfile.growthSchedule.length > 0) {
    // Find the week for the current growth phase if it exists
    const weekMatchingPhase = activeProfile.growthSchedule.find(
      week => week.growthPhase === currentPhase
    );
    
    if (weekMatchingPhase) {
      currentWeek = weekMatchingPhase.week;
    }
  }

  // Get total weeks in growth schedule
  const totalWeeks = activeProfile?.growthSchedule?.length || 0;

  // Only show loading animation on initial load, not during refreshes
  const showLoadingState = !streamData && sensorsLoading && !initialLoaded;

  // Format sensor values for display
  const phValue = effectiveSensorData ? effectiveSensorData.ph.toFixed(2) : null;
  const ecValue = effectiveSensorData ? `${effectiveSensorData.ec.toFixed(2)} mS/cm` : null;
  const tempValue = effectiveSensorData ? `${effectiveSensorData.waterTemp.toFixed(1)}°C` : null;

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center">
            <span className="text-sm mr-3">
              {streamConnected ? 
                <span className="text-green-500">●</span> : 
                <span className="text-yellow-500">●</span>
              } 
              {streamConnected ? 'Live' : 'Polling'} data
            </span>
            <span className="text-sm">Last update: {lastUpdate}</span>
          </div>
        </div>

        {/* Active Plant Profile Card */}
        <div className="mb-8">
          <ActiveProfileCard
            activeProfile={activeProfile}
            isLoading={profileLoading}
          />
        </div>

        {/* Display simplified sensor error message */}
        {shouldShowSensorError && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-8 text-red-200">
            <div className="flex items-start">
              <svg className="w-6 h-6 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Sensor Connection Issues</h3>
                {effectiveSensorError && effectiveSensorError.type === 'connection' ? (
                  <div>
                    <p className="mb-2">
                      {/* If there's a connection error and any one sensor is mentioned, likely all are affected */}
                      {(effectiveSensorError.message.includes('connection error') || 
                        effectiveSensorError.message.includes('Failed to fetch') ||
                        effectiveSensorError.message.includes('I2C') ||
                        (effectiveSensorError.message.includes('pH') && effectiveSensorError.message.includes('EC') && 
                        (effectiveSensorError.message.includes('Temperature') || effectiveSensorError.message.includes('RTD')))) ? (
                        <>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">pH Sensor</span>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">EC Sensor</span>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">Temperature Sensor</span>
                          <span>All sensors disconnected or not responding</span>
                        </>
                      ) : (
                        <>
                          {effectiveSensorError.message.includes('pH') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">pH Sensor</span>
                          ) : null}
                          {effectiveSensorError.message.includes('EC') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">EC Sensor</span>
                          ) : null}
                          {effectiveSensorError.message.includes('Temperature') || effectiveSensorError.message.includes('RTD') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">Temperature Sensor</span>
                          ) : null}
                          {!effectiveSensorError.message.includes('pH') && !effectiveSensorError.message.includes('EC') && 
                            !effectiveSensorError.message.includes('Temperature') && !effectiveSensorError.message.includes('RTD') ? (
                            <span>One or more sensors are disconnected</span>
                          ) : (
                            <span>disconnected or not responding</span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-sm">Please check connections and restart the system if necessary.</p>
                  </div>
                ) : (
                  <p>{streamError ? streamError.message : 'Connection issue with sensors'}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sensor Readings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <SensorCard
            title="pH Level"
            value={phValue}
            target={activeProfile ? 
              `${activeProfile.targetPh.min?.toFixed(1) || (activeProfile.targetPh.target - activeProfile.targetPh.buffer).toFixed(1)} - ${activeProfile.targetPh.max?.toFixed(1) || (activeProfile.targetPh.target + activeProfile.targetPh.buffer).toFixed(1)}` 
              : "5.8 - 6.2"}
            status={phStatus}
            isLoading={showLoadingState}
            hasError={!!sensorError && !simulationEnabled}
            calibrationPath="/calibration/ph"
          />

          <SensorCard
            title="EC Level"
            value={ecValue}
            target={activeProfile ? 
              `${activeProfile.targetEc.min?.toFixed(1) || (activeProfile.targetEc.target - activeProfile.targetEc.buffer).toFixed(1)} - ${activeProfile.targetEc.max?.toFixed(1) || (activeProfile.targetEc.target + activeProfile.targetEc.buffer).toFixed(1)} mS/cm` 
              : "1.2 - 1.5 mS/cm"}
            status={ecStatus}
            isLoading={showLoadingState}
            hasError={!!sensorError && !simulationEnabled}
            calibrationPath="/calibration/ec"
          />

          <SensorCard
            title="Water Temperature"
            value={tempValue}
            target="20 - 24°C"
            status={tempStatus}
            isLoading={showLoadingState}
            hasError={!!sensorError && !simulationEnabled}
            calibrationPath="/calibration/temp"
          />
        </div>

        {/* Pump Status, Auto-Dosing and Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <PumpStatusCard
            pumpStatus={Array.isArray(effectivePumpData) ? effectivePumpData : effectivePumpData?.pumpStatus || null}
            isLoading={!initialLoaded && pumpsLoading}
            hasError={!!pumpError}
          />

          <RecentActivityCard
            events={Array.isArray(effectivePumpData) ? [] : effectivePumpData?.recentEvents || null}
            isLoading={!initialLoaded && pumpsLoading}
            hasError={!!pumpError}
            hasSensorError={shouldShowSensorError}
            errorMessage={pumpError?.message}
          />
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/profiles" className="btn">Plant Profiles</Link>
            <Link href="/dosing" className="btn">Adjust pH</Link>
            <Link href="/dosing?tab=autodosing" className="btn">Auto-Dosing</Link>
            <Link href="/pumps" className="btn">Calibrate Sensors</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

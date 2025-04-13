"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "./components/Sidebar";
import { useSidebar } from "./components/SidebarContext";
import { useSensorData } from "./hooks/useSensorData";
import { usePumpData } from "./hooks/usePumpData";
import { useProfileData } from "./hooks/useProfileData";
import { SensorData } from "./lib/sensors";

export default function Home() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const { collapsed } = useSidebar();
  
  // Track initial loading state separately from refresh loading
  const [initialLoaded, setInitialLoaded] = useState(false);
  
  // Use the custom hooks to fetch real-time data
  const { data: sensorData, isLoading: sensorsLoading, error: sensorError, refresh: refreshSensors } = useSensorData(10000); // Refresh every 10 seconds
  const { data: pumpData, isLoading: pumpsLoading, error: pumpError, refresh: refreshPumps } = usePumpData(10000); // Refresh every 10 seconds
  const { activeProfile, isLoading: profileLoading } = useProfileData({ refreshInterval: 10000 }); // Refresh every 10 seconds
  
  // Set initial load state once data is first loaded
  useEffect(() => {
    if (sensorData && !initialLoaded) {
      setInitialLoaded(true);
    }
  }, [sensorData, initialLoaded]);
  
  // Initialize the system via API on component mount
  useEffect(() => {
    // Call the initialization API on startup
    fetch('/api/init').catch(error => {
      console.error('Failed to initialize systems:', error);
    });
  }, []);

  // Refresh all data function
  const refreshAllData = () => {
    refreshSensors();
    refreshPumps();
  };

  // Format the timestamp if we have data
  const lastUpdate = sensorData?.timestamp 
    ? new Date(sensorData.timestamp).toLocaleTimeString() 
    : 'Loading...';
  
  // Calculate status indicators based on real-time values
  const phStatus = !sensorData ? "status-warning" : 
    sensorData.ph < 5.5 || sensorData.ph > 6.5 
      ? "status-danger" 
      : (sensorData.ph < 5.8 || sensorData.ph > 6.2) 
        ? "status-warning" 
        : "status-good";
  
  const ecStatus = !sensorData ? "status-warning" : 
    sensorData.ec < 1.0 || sensorData.ec > 1.8 
      ? "status-danger" 
      : (sensorData.ec < 1.2 || sensorData.ec > 1.5) 
        ? "status-warning" 
        : "status-good";
  
  const tempStatus = !sensorData ? "status-warning" : 
    sensorData.waterTemp < 18 || sensorData.waterTemp > 26 
      ? "status-danger" 
      : (sensorData.waterTemp < 20 || sensorData.waterTemp > 24) 
        ? "status-warning" 
        : "status-good";

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
  const showLoadingState = !initialLoaded && sensorsLoading;

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center">
            <span className="text-sm mr-4">Last update: {lastUpdate}</span>
            <button 
              className="btn btn-secondary flex items-center"
              onClick={refreshAllData}
              disabled={sensorsLoading || pumpsLoading}
            >
              <svg className={`w-4 h-4 mr-2 ${sensorsLoading || pumpsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {sensorsLoading || pumpsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Active Plant Profile Card */}
        <div className="mb-8">
          <div className="card relative overflow-hidden">
            {activeProfile && (
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00a3e0]"></div>
            )}
            <div className="card-header">
              <h2 className="card-title">Active Plant Profile</h2>
              <Link href="/profiles" className="btn btn-secondary text-sm">Manage Profiles</Link>
            </div>
            <div className="p-4">
              {profileLoading ? (
                <div className="animate-pulse text-center py-4">Loading profile...</div>
              ) : !activeProfile ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <p className="text-gray-400 mb-3">No active plant profile selected</p>
                  <Link href="/profiles" className="btn text-sm">Set Active Profile</Link>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center mb-4">
                      <h3 className="text-xl font-semibold text-[#00a3e0]">{activeProfile.name}</h3>
                      <span className="ml-2 px-2 py-0.5 bg-[#00a3e0] text-black text-xs rounded-full">Active</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div className="bg-[#1e1e1e] p-3 rounded-md">
                        <p className="text-gray-400 text-xs uppercase mb-1">Crop Type</p>
                        <p className="font-medium">{activeProfile.cropType}</p>
                      </div>
                      <div className="bg-[#1e1e1e] p-3 rounded-md">
                        <p className="text-gray-400 text-xs uppercase mb-1">Growth Phase</p>
                        <p className="font-medium">{activeProfile.growthPhase || "Not specified"}</p>
                      </div>
                      <div className="bg-[#1e1e1e] p-3 rounded-md">
                        <p className="text-gray-400 text-xs uppercase mb-1">Target pH Range</p>
                        <p className="font-medium">{activeProfile.targetPh.min} - {activeProfile.targetPh.max}</p>
                      </div>
                      <div className="bg-[#1e1e1e] p-3 rounded-md">
                        <p className="text-gray-400 text-xs uppercase mb-1">Target EC Range</p>
                        <p className="font-medium">{activeProfile.targetEc.min} - {activeProfile.targetEc.max} mS/cm</p>
                      </div>
                    </div>
                    {activeProfile.notes && (
                      <div className="bg-[#1e1e1e] p-3 rounded-md mb-4">
                        <p className="text-gray-400 text-xs uppercase mb-1">Notes</p>
                        <p className="text-sm">{activeProfile.notes}</p>
                      </div>
                    )}
                  </div>
                  
                  {totalWeeks > 0 && (
                    <div className="bg-[#162736] border border-[#00a3e0]/20 p-5 rounded-lg flex flex-col items-center min-w-[220px] shadow-[0_0_15px_rgba(0,163,224,0.15)]">
                      <h4 className="text-sm text-[#00a3e0] mb-3 uppercase font-medium">Growth Progress</h4>
                      <div className="w-16 h-16 rounded-full border-4 border-[#333] flex items-center justify-center mb-3 relative">
                        <svg className="w-full h-full absolute" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="#444"
                            strokeWidth="1"
                            strokeDasharray="100, 100"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="url(#gradient)"
                            strokeWidth="3"
                            strokeDasharray={`${Math.min(100, (currentWeek / totalWeeks) * 100)}, 100`}
                            className="progress-circle"
                          />
                          <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#00a3e0" />
                              <stop offset="100%" stopColor="#00f0c7" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="text-center">
                          <div className="text-xl font-bold">{currentWeek}</div>
                          <div className="text-xs text-gray-400">WEEK</div>
                        </div>
                      </div>
                      <div className="text-center mb-3">
                        <p className="font-medium text-lg">{currentPhase}</p>
                        <p className="text-xs text-gray-400">CURRENT PHASE</p>
                      </div>
                      <div className="w-full bg-[#333333] rounded-full h-1.5 mb-2">
                        <div 
                          className="bg-gradient-to-r from-[#00a3e0] to-[#00f0c7] h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, (currentWeek / totalWeeks) * 100)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between w-full text-xs text-gray-400">
                        <span>Week 1</span>
                        <span>Week {totalWeeks}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Display simplified sensor error message */}
        {sensorError && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-8 text-red-200">
            <div className="flex items-start">
              <svg className="w-6 h-6 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Sensor Connection Issues</h3>
                {sensorError.type === 'connection' ? (
                  <div>
                    <p className="mb-2">
                      {/* If there's a connection error and any one sensor is mentioned, likely all are affected */}
                      {(sensorError.message.includes('connection error') || 
                        sensorError.message.includes('Failed to fetch') ||
                        sensorError.message.includes('I2C') ||
                        (sensorError.message.includes('pH') && sensorError.message.includes('EC') && 
                        (sensorError.message.includes('Temperature') || sensorError.message.includes('RTD')))) ? (
                        <>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">pH Sensor</span>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">EC Sensor</span>
                          <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">Temperature Sensor</span>
                          <span>All sensors disconnected or not responding</span>
                        </>
                      ) : (
                        <>
                          {sensorError.message.includes('pH') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">pH Sensor</span>
                          ) : null}
                          {sensorError.message.includes('EC') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">EC Sensor</span>
                          ) : null}
                          {sensorError.message.includes('Temperature') || sensorError.message.includes('RTD') ? (
                            <span className="inline-block px-2 py-1 mr-2 bg-red-900/50 rounded">Temperature Sensor</span>
                          ) : null}
                          {!sensorError.message.includes('pH') && !sensorError.message.includes('EC') && 
                            !sensorError.message.includes('Temperature') && !sensorError.message.includes('RTD') ? (
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
                  <p>{sensorError.message}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sensor Readings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">pH Level</h2>
              <div className="sensor-status">
                <div className={`status-indicator ${phStatus}`}></div>
                <span>{phStatus === "status-good" ? "Optimal" : phStatus === "status-warning" ? "Warning" : "Critical"}</span>
              </div>
            </div>
            <div className="data-value">
              {showLoadingState ? (
                <span className="animate-pulse">Loading...</span>
              ) : sensorError ? (
                <span className="text-red-500">Sensor Error</span>
              ) : (
                sensorData?.ph.toFixed(2) || 'N/A'
              )}
            </div>
            <div className="data-label">Target: 5.8 - 6.2</div>
            <div className="mt-4">
              <Link href="/calibration/ph" className="btn btn-secondary mr-2 text-sm">Calibrate</Link>
              <Link href="/logs" className="btn btn-secondary text-sm">History</Link>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">EC Level</h2>
              <div className="sensor-status">
                <div className={`status-indicator ${ecStatus}`}></div>
                <span>{ecStatus === "status-good" ? "Optimal" : ecStatus === "status-warning" ? "Warning" : "Critical"}</span>
              </div>
            </div>
            <div className="data-value">
              {showLoadingState ? (
                <span className="animate-pulse">Loading...</span>
              ) : sensorError ? (
                <span className="text-red-500">Sensor Error</span>
              ) : (
                `${sensorData?.ec.toFixed(2) || 'N/A'} mS/cm`
              )}
            </div>
            <div className="data-label">Target: 1.2 - 1.5 mS/cm</div>
            <div className="mt-4">
              <Link href="/calibration/ec" className="btn btn-secondary mr-2 text-sm">Calibrate</Link>
              <Link href="/logs" className="btn btn-secondary text-sm">History</Link>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Water Temperature</h2>
              <div className="sensor-status">
                <div className={`status-indicator ${tempStatus}`}></div>
                <span>{tempStatus === "status-good" ? "Optimal" : tempStatus === "status-warning" ? "Warning" : "Critical"}</span>
              </div>
            </div>
            <div className="data-value">
              {showLoadingState ? (
                <span className="animate-pulse">Loading...</span>
              ) : sensorError ? (
                <span className="text-red-500">Sensor Error</span>
              ) : (
                `${sensorData?.waterTemp.toFixed(1) || 'N/A'}°C`
              )}
            </div>
            <div className="data-label">Target: 20 - 24°C</div>
            <div className="mt-4">
              <Link href="/calibration/temp" className="btn btn-secondary mr-2 text-sm">Calibrate</Link>
              <Link href="/logs" className="btn btn-secondary text-sm">History</Link>
            </div>
          </div>
        </div>

        {/* Pump Status and Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Pump Status</h2>
              <Link href="/pumps" className="btn text-sm">Manual Control</Link>
            </div>
            <div className="space-y-3">
              {!initialLoaded && pumpsLoading ? (
                <div className="animate-pulse text-center py-4">Loading pump status...</div>
              ) : pumpError ? (
                <div className="text-red-500 p-3 border border-red-700/50 bg-red-900/20 rounded">
                  Error loading pump status: {pumpError.message}
                </div>
              ) : (
                pumpData?.pumpStatus.map((pump, index) => (
                  <div key={index} className="flex justify-between items-center border-b border-[#333333] pb-2 last:border-0">
                    <div className="flex items-center">
                      <div className={`status-indicator ${pump.active ? 'status-good' : ''}`}></div>
                      <span className="text-white">{pump.name}</span>
                    </div>
                    <span className="text-gray-300">{pump.active ? 'Active' : 'Idle'}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Recent Activity</h2>
              <Link href="/logs" className="btn btn-secondary text-sm">View All</Link>
            </div>
            <div className="space-y-3">
              {sensorError ? (
                <div className="text-yellow-500 p-3 border border-yellow-700/50 bg-yellow-900/20 rounded">
                  Sensor error detected. Check sensor connections and configuration.
                </div>
              ) : !initialLoaded && pumpsLoading ? (
                <div className="animate-pulse text-center py-4">Loading activity history...</div>
              ) : pumpError ? (
                <div className="text-red-500 p-3 border border-red-700/50 bg-red-900/20 rounded">
                  Error loading activity history: {pumpError.message}
                </div>
              ) : pumpData?.recentEvents.length === 0 ? (
                <div className="text-gray-500 text-center py-4">No recent activity to display</div>
              ) : (
                pumpData?.recentEvents.map((event, index) => (
                  <div key={index} className="flex border-b border-[#333333] pb-2 last:border-0">
                    <div className="text-sm text-[#a0a0a0] w-24">{event.time}</div>
                    <div className="text-sm text-white">{event.event}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/profiles" className="btn">Plant Profiles</Link>
            <Link href="/dosing" className="btn">Adjust pH</Link>
            <Link href="/dosing" className="btn">Dose Nutrients</Link>
            <Link href="/pumps" className="btn">Calibrate Sensors</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

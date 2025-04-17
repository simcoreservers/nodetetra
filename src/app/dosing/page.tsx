"use client";

import { useState, ChangeEvent, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useDosingData, DosingHistoryEntry } from "../hooks/useDosingData";
import { useAutoDosing } from "../hooks/useAutoDosing";

// Define an interface for the unified config structure
interface UnifiedDosingConfig {
  targets?: {
    ph?: {
      min: number;
      max: number;
      target: number;
      tolerance: number;
    };
    ec?: {
      min: number;
      max: number;
      target: number;
      tolerance: number;
    };
  };
  pumps?: Record<string, {
    limits: number;
    flowRate: number;
    doseAmount: number;
    minInterval: number;
  }>;
  // Include any other properties you need
}

// Extend the DosingData interface to include config
interface ExtendedDosingData {
  settings?: any;
  history?: DosingHistoryEntry[];
  config?: UnifiedDosingConfig;
}

export default function DosingPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  const [activeTab, setActiveTab] = useState<string>(tabParam || 'settings');
  const [activeSection, setActiveSection] = useState<string>('dosing');
  const { collapsed } = useSidebar();
  
  // Form state for inputs (removing pH and EC states since they're from active profile)
  const [phUpLimit, setPhUpLimit] = useState<number | string>("");
  const [phDownLimit, setPhDownLimit] = useState<number | string>("");
  const [nutrientALimit, setNutrientALimit] = useState<number | string>("");
  const [nutrientBLimit, setNutrientBLimit] = useState<number | string>("");

  // New form state for minInterval settings
  const [phUpInterval, setPhUpInterval] = useState<number | string>("");
  const [phDownInterval, setPhDownInterval] = useState<number | string>("");
  const [nutrientInterval, setNutrientInterval] = useState<number | string>("");

  // Simulation mode state
  const [simulationEnabled, setSimulationEnabled] = useState<boolean>(true);

  const { 
    data: rawData, 
    activeProfile,
    isLoading, 
    error, 
    refresh,
    updateDosingSchedule,
    updateDosingLimits
  } = useDosingData();

  // Cast the data to our extended interface
  const data = rawData as unknown as ExtendedDosingData;

  // Add auto-dosing hook
  const {
    config: autoDoseConfig,
    isLoading: autoDoseLoading,
    error: autoDoseError,
    isDosingInProgress,
    toggleEnabled: toggleAutoDosing,
    updateConfig: updateAutoDoseConfig,
    resetConfig: resetAutoDoseConfig,
    triggerDosing: triggerAutoDosing
  } = useAutoDosing();

  // Update local state when API data is loaded
  useEffect(() => {
    if (data) {
      // Check if data uses the new unified format or the legacy format
      // The new format would contain a 'config' key instead of a 'settings' key
      const settings = data.config ? data.config : data.settings;
      
      if (settings && settings.dosingLimits) {
        setPhUpLimit(settings.dosingLimits["pH Up"] || 50);
        setPhDownLimit(settings.dosingLimits["pH Down"] || 50);
        setNutrientALimit(settings.dosingLimits["Nutrient A"] || 100);
        setNutrientBLimit(settings.dosingLimits["Nutrient B"] || 100);
      } else if (data.config && data.config.pumps) {
        // Handle new unified format with pumps object
        const pumps = data.config.pumps;
        setPhUpLimit(pumps["pH Up"]?.limits || 50);
        setPhDownLimit(pumps["pH Down"]?.limits || 50);
        setNutrientALimit(pumps["Nutrient A"]?.limits || 100);
        setNutrientBLimit(pumps["Nutrient B"]?.limits || 100);
      }
    }
  }, [data]);

  // Define a helper function to access data in either format
  const getDataValue = (key: string) => {
    if (!data) return null;
    
    // Handle unified structure (data.config)
    if (data.config) {
      return data.config;
    }
    
    // Handle legacy structure (data.settings)
    return data.settings;
  };

  // Create helper function for accessing pH and EC data
  const getPhData = () => {
    if (!data) return null;
    
    // Check unified format
    if (data.config && data.config.targets && data.config.targets.ph) {
      return {
        min: data.config.targets.ph.min,
        max: data.config.targets.ph.max,
        current: data.config.targets.ph.target
      };
    }
    
    // Check legacy format
    if (data.settings && data.settings.targetPh) {
      return data.settings.targetPh;
    }
    
    return null;
  };
  
  const getEcData = () => {
    if (!data) return null;
    
    // Check unified format
    if (data.config && data.config.targets && data.config.targets.ec) {
      return {
        min: data.config.targets.ec.min,
        max: data.config.targets.ec.max,
        current: data.config.targets.ec.target
      };
    }
    
    // Check legacy format
    if (data.settings && data.settings.targetEc) {
      return data.settings.targetEc;
    }
    
    return null;
  };

  // Auto-sync the auto-dosing config with active profile when data changes
  useEffect(() => {
    const phData = getPhData();
    const ecData = getEcData();
    
    if (phData && ecData && autoDoseConfig && !autoDoseLoading) {
      const phTarget = (phData.min + phData.max) / 2;
      const phTolerance = (phData.max - phData.min) / 2;
      const ecTarget = (ecData.min + ecData.max) / 2;
      const ecTolerance = (ecData.max - ecData.min) / 2;
      
      // Only update if values are different to avoid unnecessary API calls
      if (phTarget !== autoDoseConfig.targets.ph.target ||
          phTolerance !== autoDoseConfig.targets.ph.tolerance ||
          ecTarget !== autoDoseConfig.targets.ec.target ||
          ecTolerance !== autoDoseConfig.targets.ec.tolerance) {
        
        updateAutoDoseConfig({
          targets: {
            ph: {
              target: phTarget,
              tolerance: phTolerance
            },
            ec: {
              target: ecTarget,
              tolerance: ecTolerance
            }
          }
        });
      }
    }
  }, [data, autoDoseConfig, autoDoseLoading, updateAutoDoseConfig]);

  // Update minInterval state from autodosing config
  useEffect(() => {
    if (autoDoseConfig && autoDoseConfig.dosing && autoDoseConfig.dosing.phUp) {
      setPhUpInterval(autoDoseConfig.dosing.phUp.minInterval);
      
      if (autoDoseConfig.dosing.phDown) {
        setPhDownInterval(autoDoseConfig.dosing.phDown.minInterval);
      }
      
      // Set a default value for nutrient pumps (assuming all have the same interval)
      const nutrientPumpKeys = Object.keys(autoDoseConfig.dosing.nutrientPumps || {});
      if (nutrientPumpKeys.length > 0) {
        const firstPump = nutrientPumpKeys[0];
        setNutrientInterval(autoDoseConfig.dosing.nutrientPumps[firstPump].minInterval);
      } else {
        setNutrientInterval(180); // Default value
      }
    }
  }, [autoDoseConfig]);

  // Fetch simulation status on page load
  useEffect(() => {
    async function fetchSimulationStatus() {
      try {
        const response = await fetch('/api/simulation');
        if (response.ok) {
          const data = await response.json();
          setSimulationEnabled(data.enabled);
        }
      } catch (err) {
        console.error('Error fetching simulation status:', err);
      }
    }
    
    fetchSimulationStatus();
  }, []);

  // Toggle simulation mode
  const toggleSimulationMode = async () => {
    try {
      const response = await fetch('/api/simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          enabled: !simulationEnabled 
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSimulationEnabled(data.enabled);
        // Reload page after 1 second to make changes take effect
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err) {
      console.error('Error toggling simulation mode:', err);
    }
  };

  // Remove handlers for pH and EC inputs since they're not editable
  
  const handlePhUpLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhUpLimit(e.target.value);
  };

  const handlePhDownLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhDownLimit(e.target.value);
  };

  const handleNutrientALimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNutrientALimit(e.target.value);
  };

  const handleNutrientBLimitChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNutrientBLimit(e.target.value);
  };

  // Handlers for minInterval inputs
  const handlePhUpIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhUpInterval(e.target.value);
  };

  const handlePhDownIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPhDownInterval(e.target.value);
  };

  const handleNutrientIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNutrientInterval(e.target.value);
  };

  // Handler to update minInterval settings
  const handleUpdateIntervals = async () => {
    if (autoDoseConfig) {
      // Create a complete dosing update object
      const updates: any = {
        dosing: {
          phUp: { ...autoDoseConfig.dosing.phUp },
          phDown: { ...autoDoseConfig.dosing.phDown },
          nutrientPumps: {}
        }
      };
      
      // Update pH Up interval if provided
      if (phUpInterval !== "") {
        updates.dosing.phUp.minInterval = Number(phUpInterval);
      }
      
      // Update pH Down interval if provided
      if (phDownInterval !== "") {
        updates.dosing.phDown.minInterval = Number(phDownInterval);
      }
      
      // Update all nutrient pump intervals if provided
      if (nutrientInterval !== "") {
        // Copy all existing nutrient pumps and update their minInterval
        Object.keys(autoDoseConfig.dosing.nutrientPumps).forEach(pumpName => {
          updates.dosing.nutrientPumps[pumpName] = {
            ...autoDoseConfig.dosing.nutrientPumps[pumpName],
            minInterval: Number(nutrientInterval)
          };
        });
      }
      
      console.log('Sending complete updates to server:', JSON.stringify(updates, null, 2));
      
      // Always update if we have changes to make
      const result = await updateAutoDoseConfig(updates);
      console.log('Update result:', result);
      
      // Force a refresh of the config
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Remove pH and EC target update handlers

  const handleUpdatePhUpLimit = async () => {
    if (phUpLimit !== "") {
      const limits: Record<string, number> = {};
      limits["pH Up"] = Number(phUpLimit);
      await updateDosingLimits(limits);
      refresh();
    }
  };

  const handleUpdatePhDownLimit = async () => {
    if (phDownLimit !== "") {
      const limits: Record<string, number> = {};
      limits["pH Down"] = Number(phDownLimit);
      await updateDosingLimits(limits);
      refresh();
    }
  };

  const handleUpdateNutrientALimit = async () => {
    if (nutrientALimit !== "") {
      const limits: Record<string, number> = {};
      limits["Nutrient A"] = Number(nutrientALimit);
      await updateDosingLimits(limits);
      refresh();
    }
  };

  const handleUpdateNutrientBLimit = async () => {
    if (nutrientBLimit !== "") {
      const limits: Record<string, number> = {};
      limits["Nutrient B"] = Number(nutrientBLimit);
      await updateDosingLimits(limits);
      refresh();
    }
  };

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex h-screen bg-[#121212] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00a3e0]"></div>
          <p className="mt-2">Loading dosing data...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="flex h-screen bg-[#121212] items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">Error loading dosing data: {error.message}</p>
          <button className="btn mt-4" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Ensure data is available
  if (!data || !data.settings) {
    return (
      <div className="flex h-screen bg-[#121212] items-center justify-center">
        <div className="text-center">
          <p>Invalid or incomplete dosing data</p>
          <button className="btn mt-4" onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Define tabs for the Dosing section
  const tabs = [
    { id: 'settings', label: 'Settings' },
    { id: 'autodosing', label: 'Auto-Dosing' },
    { id: 'history', label: 'History' }
  ];

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dosing Settings</h1>
          <div className="flex items-center">
            <button className="btn" onClick={refresh}>Refresh Data</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[#333333]">
          <div className="flex">
            {tabs.map((tab) => (
              <button 
                key={tab.id}
                className={`px-4 py-2 font-medium ${activeTab === tab.id ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`} 
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* pH Range - Changed to read-only with info about active profile */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">pH Target Range</h2>
              </div>
              <div className="space-y-4 mt-4">
                {(() => {
                  const phData = getPhData();
                  if (!phData) {
                    return (
                      <div className="text-center py-4">
                        <p className="text-yellow-500">pH target data not available</p>
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Min pH:</span>
                        <span className="text-xl font-medium">{phData.min}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Max pH:</span>
                        <span className="text-xl font-medium">{phData.max}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Current pH:</span>
                        <span className="text-xl font-medium">{phData.current}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="mt-4 p-3 bg-[#1e1e1e] rounded-lg">
                  <p className="text-sm text-gray-400">
                    <span className="text-[#00a3e0]">Note:</span> pH target range is controlled by the active plant profile. 
                    {activeProfile && (
                      <span> Currently using profile "{activeProfile.name}".</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            {/* EC Range - Changed to read-only with info about active profile */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">EC Target Range</h2>
              </div>
              <div className="space-y-4 mt-4">
                {(() => {
                  const ecData = getEcData();
                  if (!ecData) {
                    return (
                      <div className="text-center py-4">
                        <p className="text-yellow-500">EC target data not available</p>
                      </div>
                    );
                  }
                  
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Min EC:</span>
                        <span className="text-xl font-medium">{ecData.min} mS/cm</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Max EC:</span>
                        <span className="text-xl font-medium">{ecData.max} mS/cm</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Current EC:</span>
                        <span className="text-xl font-medium">{ecData.current} mS/cm</span>
                      </div>
                    </>
                  );
                })()}
                <div className="mt-4 p-3 bg-[#1e1e1e] rounded-lg">
                  <p className="text-sm text-gray-400">
                    <span className="text-[#00a3e0]">Note:</span> EC target range is controlled by the active plant profile. 
                    To change these settings, update your active profile.
                  </p>
                </div>
              </div>
            </div>

            {/* Maximum Daily Dosage Limits */}
            <div className="card md:col-span-2">
              <div className="card-header">
                <h2 className="card-title">Maximum Daily Dosage Limits</h2>
              </div>
              <div className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1">pH Up (ml per day)</label>
                    <div className="flex items-center">
                      <input 
                        type="number" 
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={phUpLimit}
                        onChange={handlePhUpLimitChange}
                      />
                      <button 
                        className="btn ml-2 px-3"
                        onClick={handleUpdatePhUpLimit}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">pH Down (ml per day)</label>
                    <div className="flex items-center">
                      <input 
                        type="number" 
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={phDownLimit}
                        onChange={handlePhDownLimitChange}
                      />
                      <button 
                        className="btn ml-2 px-3"
                        onClick={handleUpdatePhDownLimit}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Nutrient A (ml per day)</label>
                    <div className="flex items-center">
                      <input 
                        type="number" 
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={nutrientALimit}
                        onChange={handleNutrientALimitChange}
                      />
                      <button 
                        className="btn ml-2 px-3"
                        onClick={handleUpdateNutrientALimit}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Nutrient B (ml per day)</label>
                    <div className="flex items-center">
                      <input 
                        type="number" 
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={nutrientBLimit}
                        onChange={handleNutrientBLimitChange}
                      />
                      <button 
                        className="btn ml-2 px-3"
                        onClick={handleUpdateNutrientBLimit}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  <span className="text-[#00a3e0]">Note:</span> These limits prevent overdosing by capping the total amount dispensed in a 24-hour period.
                </div>
              </div>
            </div>
            
            {/* System Logging Settings */}
            <div className="card md:col-span-2 mt-6">
              <div className="card-header">
                <h2 className="card-title">System Logging</h2>
              </div>
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-4">
                  Configure how much detail is logged in the server console. Higher levels include more detailed logs which is useful for debugging but can make the console harder to read.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  {['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].map((level, index) => (
                    <button
                      key={level}
                      className={`py-2 px-4 rounded-md text-sm ${
                        process.env.NUTETRA_LOG_LEVEL === index.toString() 
                          ? 'bg-[#00a3e0] text-white' 
                          : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333333]'
                      }`}
                      onClick={() => {
                        // This just saves the setting locally - requires a server restart to take effect
                        localStorage.setItem('NUTETRA_LOG_LEVEL', index.toString());
                        alert(`Log level set to ${level}. Restart the server for this to take effect.`);
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                
                <div className="mt-3 text-xs text-gray-400">
                  <span className="text-[#00a3e0]">Note:</span> Log level changes require a server restart to take effect. In production, set the NUTETRA_LOG_LEVEL environment variable.
                  <ul className="list-disc ml-5 mt-1">
                    <li>ERROR (0): Only show critical errors</li>
                    <li>WARN (1): Show errors and warnings</li>
                    <li>INFO (2): Default - show operational messages</li>
                    <li>DEBUG (3): Detailed messages for troubleshooting</li>
                    <li>TRACE (4): Very verbose, shows all system activity</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'autodosing' && (
          <div className="space-y-6">
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="card-title">Auto-Dosing System</h2>
                <div className="flex items-center">
                  <span className="mr-3 text-sm text-gray-400">
                    {autoDoseConfig?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={toggleAutoDosing}
                    disabled={autoDoseLoading}
                    className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00a3e0] focus:ring-offset-2 ${
                      autoDoseConfig?.enabled ? 'bg-[#00a3e0]' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoDoseConfig?.enabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-4">
                  Auto-dosing continuously monitors your pH and EC levels using live sensor readings and dispenses nutrients or pH adjusters as needed to maintain optimal conditions. No scheduled checks are used - the system responds directly to current water conditions.
                </p>
                {autoDoseLoading ? (
                  <div className="flex justify-center p-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#00a3e0]"></div>
                  </div>
                ) : autoDoseError ? (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                    <p className="text-red-400 text-sm">Error: {autoDoseError.message}</p>
                  </div>
                ) : !autoDoseConfig ? (
                  <div className="p-3 bg-[#1e1e1e] rounded-lg">
                    <p className="text-gray-400 text-sm">Loading auto-dosing configuration...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status Card */}
                    <div className="bg-[#1e1e1e] rounded-lg p-4">
                      <h3 className="text-md font-medium mb-3">System Status</h3>
                      {isDosingInProgress && (
                        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-3 flex items-center">
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#00a3e0] mr-2"></div>
                          <p className="text-blue-400 text-sm">Dosing in progress... Please wait.</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-400">Status:</p>
                          <p className={`font-medium ${autoDoseConfig.enabled ? 'text-green-500' : 'text-yellow-500'}`}>
                            {autoDoseConfig.enabled ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">pH Target:</p>
                          <p className="font-medium">{autoDoseConfig.targets.ph.target} ± {autoDoseConfig.targets.ph.tolerance}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">EC Target:</p>
                          <p className="font-medium">{autoDoseConfig.targets.ec.target} ± {autoDoseConfig.targets.ec.tolerance} mS/cm</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Last pH Up Dose:</p>
                          <p className="font-medium">
                            {autoDoseConfig.lastDose.phUp 
                              ? new Date(autoDoseConfig.lastDose.phUp).toLocaleTimeString() 
                              : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Last pH Down Dose:</p>
                          <p className="font-medium">
                            {autoDoseConfig.lastDose.phDown 
                              ? new Date(autoDoseConfig.lastDose.phDown).toLocaleTimeString() 
                              : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Last Nutrient Dose:</p>
                          <p className="font-medium">
                            {Object.values(autoDoseConfig.lastDose.nutrientPumps).some(timestamp => timestamp !== null) 
                              ? 'Recently' : 'Never'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Settings Form */}
                    <div>
                      <h3 className="text-md font-medium mb-3">Target Settings</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* pH Target - Changed to read-only */}
                        <div className="space-y-4">
                          <div className="bg-[#1e1e1e] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">pH Target:</span>
                              <span className="text-xl font-medium">
                                {(() => {
                                  const phData = getPhData();
                                  if (phData) {
                                    return ((phData.min + phData.max) / 2).toFixed(2);
                                  } 
                                  return autoDoseConfig?.targets?.ph?.target.toFixed(2) || '0.00';
                                })()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">pH Tolerance (±):</span>
                              <span className="text-xl font-medium">
                                {(() => {
                                  const phData = getPhData();
                                  if (phData) {
                                    return ((phData.max - phData.min) / 2).toFixed(2);
                                  }
                                  return autoDoseConfig?.targets?.ph?.tolerance.toFixed(2) || '0.00';
                                })()}
                              </span>
                            </div>
                            <div className="mt-3 text-sm text-gray-400">
                              <span className="text-[#00a3e0]">Note:</span> pH target is derived from your active plant profile.
                              {activeProfile && (
                                <span> Currently using profile "{activeProfile.name}".</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* EC Target - Changed to read-only */}
                        <div className="space-y-4">
                          <div className="bg-[#1e1e1e] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">EC Target:</span>
                              <span className="text-xl font-medium">
                                {(() => {
                                  const ecData = getEcData();
                                  if (ecData) {
                                    return ((ecData.min + ecData.max) / 2).toFixed(2);
                                  }
                                  return autoDoseConfig?.targets?.ec?.target.toFixed(2) || '0.00';
                                })()} mS/cm
                              </span>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">EC Tolerance (±):</span>
                              <span className="text-xl font-medium">
                                {(() => {
                                  const ecData = getEcData();
                                  if (ecData) {
                                    return ((ecData.max - ecData.min) / 2).toFixed(2);
                                  }
                                  return autoDoseConfig?.targets?.ec?.tolerance.toFixed(2) || '0.00';
                                })()} mS/cm
                              </span>
                            </div>
                            <div className="mt-3 text-sm text-gray-400">
                              <span className="text-[#00a3e0]">Note:</span> EC target is derived from your active plant profile.
                              To change these settings, update your active profile.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Minimum Interval Settings - New Section */}
                    <div>
                      <h3 className="text-md font-medium mb-3">Minimum Dosing Intervals</h3>
                      <div className="bg-[#1e1e1e] rounded-lg p-4">
                        <p className="text-sm text-gray-400 mb-4">
                          Set the minimum time required between consecutive doses for each pump type. This prevents over-dosing and allows time for chemicals to mix properly.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          {/* pH Up Interval */}
                          <div className="space-y-2">
                            <label className="block text-sm text-gray-400">
                              pH Up Minimum Interval (seconds)
                            </label>
                            <div className="flex">
                              <input
                                type="number"
                                min="0"
                                value={phUpInterval}
                                onChange={handlePhUpIntervalChange}
                                className="form-input w-full bg-[#2a2a2a] border-[#444] rounded text-white"
                                placeholder="120"
                              />
                            </div>
                          </div>
                          
                          {/* pH Down Interval */}
                          <div className="space-y-2">
                            <label className="block text-sm text-gray-400">
                              pH Down Minimum Interval (seconds)
                            </label>
                            <div className="flex">
                              <input
                                type="number"
                                min="0"
                                value={phDownInterval}
                                onChange={handlePhDownIntervalChange}
                                className="form-input w-full bg-[#2a2a2a] border-[#444] rounded text-white"
                                placeholder="120"
                              />
                            </div>
                          </div>
                          
                          {/* Nutrient Pumps Interval */}
                          <div className="space-y-2">
                            <label className="block text-sm text-gray-400">
                              Nutrient Pumps Minimum Interval (seconds)
                            </label>
                            <div className="flex">
                              <input
                                type="number"
                                min="0"
                                value={nutrientInterval}
                                onChange={handleNutrientIntervalChange}
                                className="form-input w-full bg-[#2a2a2a] border-[#444] rounded text-white"
                                placeholder="180"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-end">
                          <button 
                            className="btn btn-sm"
                            onClick={handleUpdateIntervals}
                            disabled={autoDoseLoading}
                          >
                            Update Intervals
                          </button>
                        </div>
                        
                        <div className="mt-3 text-xs text-gray-400">
                          <span className="text-[#00a3e0]">Note:</span> Setting intervals too short may cause over-dosing. 
                          Recommended minimum: 120 seconds (2 minutes) for pH adjusters, 180 seconds (3 minutes) for nutrients.
                        </div>
                      </div>
                    </div>

                    {/* Dosing Controls */}
                    <div>
                      <h3 className="text-md font-medium mb-3">Dosing Controls</h3>
                      <div className="flex space-x-4">
                        <button 
                          className={`btn ${isDosingInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={triggerAutoDosing}
                          disabled={autoDoseLoading || !autoDoseConfig.enabled || isDosingInProgress}
                        >
                          {isDosingInProgress ? 'Dosing in Progress...' : 'Run Dosing Cycle Now'}
                        </button>
                        <button 
                          className={`btn btn-secondary ${isDosingInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={resetAutoDoseConfig}
                          disabled={autoDoseLoading || isDosingInProgress}
                        >
                          Reset Settings
                        </button>
                      </div>
                      <div className="mt-3 p-3 bg-[#1e1e1e] rounded-lg">
                        <p className="text-sm text-gray-400">
                          <span className="text-[#00a3e0]">Note:</span> Auto-dosing targets are automatically synchronized with your active plant profile.
                          {isDosingInProgress && (
                            <span className="block mt-2 text-yellow-400">
                              A dosing operation is currently in progress and cannot be interrupted. Please wait for it to complete.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Simulation Mode Controls */}
                    <div className="mt-6">
                      <div className="bg-[#1e1e1e] rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="text-md font-medium mb-1">Sensor Simulation Mode</h3>
                            <p className="text-sm text-gray-400">
                              In simulation mode, the system generates fake sensor readings for testing, but pumps will still actually dispense.
                            </p>
                          </div>
                          <div className="ml-4">
                            <button
                              className={`btn ${simulationEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                              onClick={toggleSimulationMode}
                            >
                              {simulationEnabled ? 'Use Real Sensors' : 'Use Simulated Sensors'}
                            </button>
                          </div>
                        </div>
                        
                        <div className={`mt-3 p-2 rounded-lg ${simulationEnabled ? 'bg-red-900/30 border border-red-700' : 'bg-green-900/30 border border-green-700'}`}>
                          <p className="text-sm text-gray-300">
                            <span className={`font-bold ${simulationEnabled ? 'text-red-400' : 'text-green-400'}`}>
                              {simulationEnabled ? 'SIMULATED SENSOR READINGS' : 'REAL SENSOR READINGS'}
                            </span>
                            <span className="ml-2">
                              {simulationEnabled 
                                ? 'Using simulated pH and EC readings, but pumps will ACTUALLY DISPENSE when triggered.' 
                                : 'Using real sensor data from your hardware.'}
                            </span>
                          </p>
                          {simulationEnabled && (
                            <p className="mt-2 text-sm text-yellow-400 font-bold">
                              WARNING: Even though sensor readings are simulated, pumps will ACTUALLY DISPENSE when triggered. Make sure your containers are ready!
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="card mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="card-title">Dosing History</h2>
              <div className="flex">
                <button className="btn btn-secondary text-sm mr-2">Export Data</button>
                <button className="btn btn-secondary text-sm">Clear History</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="border-b border-[#333333]">
                  <tr>
                    <th className="text-left pb-2">Time</th>
                    <th className="text-left pb-2">Pump</th>
                    <th className="text-left pb-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history && data.history.length > 0 ? (
                    data.history.map((event, index) => (
                      <tr key={index} className="border-b border-[#333333]">
                        <td className="py-3 text-sm text-gray-400">{event.timestamp}</td>
                        <td className="py-3">{event.details?.split(' ')[0] || 'Unknown'}</td>
                        <td className="py-3">{event.action}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-3 text-center text-gray-400">No history available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-center">
              <button className="btn btn-secondary text-sm">Load More</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
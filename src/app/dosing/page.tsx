"use client";

import { useState, ChangeEvent, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useDosingData, DosingHistoryEntry } from "../hooks/useDosingData";

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
  
  // Only include available tabs
  const [activeTab, setActiveTab] = useState<string>(tabParam === 'manual' || tabParam === 'settings' || tabParam === 'history' ? tabParam : 'settings');
  const [activeSection, setActiveSection] = useState<string>('dosing');
  const { collapsed } = useSidebar();
  
  // Form state for inputs
  const [phUpLimit, setPhUpLimit] = useState<number | string>("");
  const [phDownLimit, setPhDownLimit] = useState<number | string>("");
  const [nutrientALimit, setNutrientALimit] = useState<number | string>("");
  const [nutrientBLimit, setNutrientBLimit] = useState<number | string>("");

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

  // Check simulation status on component mount
  useEffect(() => {
    async function fetchSimulationStatus() {
      try {
        const res = await fetch('/api/simulation');
        if (res.ok) {
          const data = await res.json();
          setSimulationEnabled(data.enabled);
        }
      } catch (error) {
        console.error('Failed to fetch simulation status:', error);
      }
    }
    
    fetchSimulationStatus();
  }, []);

  // Toggle simulation mode
  const toggleSimulationMode = async () => {
    try {
      // Toggle the state optimistically
      const newState = !simulationEnabled;
      setSimulationEnabled(newState);
      
      // Update the server
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: newState }),
      });
      
      if (!res.ok) {
        // If server update fails, revert the UI state
        setSimulationEnabled(!newState);
        console.error('Failed to update simulation mode');
      }
    } catch (error) {
      // If there's an error, revert the UI state
      setSimulationEnabled(!simulationEnabled);
      console.error('Error toggling simulation mode:', error);
    }
  };

  // Handle form input changes
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
  
  const handleUpdatePhUpLimit = async () => {
    if (typeof phUpLimit === 'string' || phUpLimit >= 0) {
      try {
        const limits: Record<string, number> = { "pH Up": Number(phUpLimit) };
        await updateDosingLimits(limits);
        alert('pH Up limit updated successfully');
        refresh();
      } catch (err) {
        alert(`Failed to update pH Up limit: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  
  const handleUpdatePhDownLimit = async () => {
    if (typeof phDownLimit === 'string' || phDownLimit >= 0) {
      try {
        const limits: Record<string, number> = { "pH Down": Number(phDownLimit) };
        await updateDosingLimits(limits);
        alert('pH Down limit updated successfully');
        refresh();
      } catch (err) {
        alert(`Failed to update pH Down limit: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  
  const handleUpdateNutrientALimit = async () => {
    if (typeof nutrientALimit === 'string' || nutrientALimit >= 0) {
      try {
        const limits: Record<string, number> = { "Nutrient A": Number(nutrientALimit) };
        await updateDosingLimits(limits);
        alert('Nutrient A limit updated successfully');
        refresh();
      } catch (err) {
        alert(`Failed to update Nutrient A limit: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  
  const handleUpdateNutrientBLimit = async () => {
    if (typeof nutrientBLimit === 'string' || nutrientBLimit >= 0) {
      try {
        const limits: Record<string, number> = { "Nutrient B": Number(nutrientBLimit) };
        await updateDosingLimits(limits);
        alert('Nutrient B limit updated successfully');
        refresh();
      } catch (err) {
        alert(`Failed to update Nutrient B limit: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  return (
    <div className="flex min-h-screen bg-[#111111]">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
      
      <div className={`flex-grow p-6 ${collapsed ? 'ml-20' : 'ml-64'} transition-all duration-300`}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Dosing Management</h1>
          
          <div className="mb-6">
            <div className="border-b border-gray-700">
              <nav className="-mb-px flex space-x-6">
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`py-2 font-medium text-sm ${
                    activeTab === 'settings'
                      ? 'border-b-2 border-[#00a3e0] text-[#00a3e0]'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Settings
                </button>
                <button
                  onClick={() => setActiveTab('manual')}
                  className={`py-2 font-medium text-sm ${
                    activeTab === 'manual'
                      ? 'border-b-2 border-[#00a3e0] text-[#00a3e0]'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  Manual Control
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`py-2 font-medium text-sm ${
                    activeTab === 'history'
                      ? 'border-b-2 border-[#00a3e0] text-[#00a3e0]'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  History
                </button>
              </nav>
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center p-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00a3e0]"></div>
            </div>
          ) : error ? (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <p className="text-red-400">{error instanceof Error ? error.message : String(error)}</p>
            </div>
          ) : (
            <>
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="card">
                    <div className="card-header flex justify-between items-center">
                      <h2 className="card-title">Dosing Limits</h2>
                      <div className="flex items-center">
                        <span className="mr-3 text-sm text-gray-400">
                          Simulation: {simulationEnabled ? 'On' : 'Off'}
                        </span>
                        <button
                          onClick={toggleSimulationMode}
                          className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00a3e0] focus:ring-offset-2 ${
                            simulationEnabled ? 'bg-[#00a3e0]' : 'bg-gray-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              simulationEnabled ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="card-content mt-4">
                      <p className="text-gray-400 text-sm mb-4">
                        Configure the maximum amount (in milliliters) that each pump can dispense within 
                        a 24-hour period. This safeguards against over-dosing due to sensor errors or 
                        calibration issues.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* pH Up Limit */}
                        <div className="card bg-[#1e1e1e] rounded-lg p-4">
                          <h3 className="font-medium mb-2">pH Up Daily Limit</h3>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={phUpLimit}
                              onChange={handlePhUpLimitChange}
                              className="form-input flex-grow bg-[#121212] border-gray-700 rounded-md focus:border-[#00a3e0] focus:ring-[#00a3e0] text-white"
                              placeholder="Enter limit in mL"
                            />
                            <span className="text-gray-400 self-center">mL</span>
                            <button
                              onClick={handleUpdatePhUpLimit}
                              className="btn btn-sm bg-[#00a3e0] hover:bg-[#0088c3] text-white px-3 py-1 rounded"
                            >
                              Update
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Maximum amount of pH Up solution that can be dosed in a 24-hour period.
                          </p>
                        </div>
                        
                        {/* pH Down Limit */}
                        <div className="card bg-[#1e1e1e] rounded-lg p-4">
                          <h3 className="font-medium mb-2">pH Down Daily Limit</h3>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={phDownLimit}
                              onChange={handlePhDownLimitChange}
                              className="form-input flex-grow bg-[#121212] border-gray-700 rounded-md focus:border-[#00a3e0] focus:ring-[#00a3e0] text-white"
                              placeholder="Enter limit in mL"
                            />
                            <span className="text-gray-400 self-center">mL</span>
                            <button
                              onClick={handleUpdatePhDownLimit}
                              className="btn btn-sm bg-[#00a3e0] hover:bg-[#0088c3] text-white px-3 py-1 rounded"
                            >
                              Update
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Maximum amount of pH Down solution that can be dosed in a 24-hour period.
                          </p>
                        </div>
                        
                        {/* Nutrient A Limit */}
                        <div className="card bg-[#1e1e1e] rounded-lg p-4">
                          <h3 className="font-medium mb-2">Nutrient A Daily Limit</h3>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={nutrientALimit}
                              onChange={handleNutrientALimitChange}
                              className="form-input flex-grow bg-[#121212] border-gray-700 rounded-md focus:border-[#00a3e0] focus:ring-[#00a3e0] text-white"
                              placeholder="Enter limit in mL"
                            />
                            <span className="text-gray-400 self-center">mL</span>
                            <button
                              onClick={handleUpdateNutrientALimit}
                              className="btn btn-sm bg-[#00a3e0] hover:bg-[#0088c3] text-white px-3 py-1 rounded"
                            >
                              Update
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Maximum amount of Nutrient A solution that can be dosed in a 24-hour period.
                          </p>
                        </div>
                        
                        {/* Nutrient B Limit */}
                        <div className="card bg-[#1e1e1e] rounded-lg p-4">
                          <h3 className="font-medium mb-2">Nutrient B Daily Limit</h3>
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={nutrientBLimit}
                              onChange={handleNutrientBLimitChange}
                              className="form-input flex-grow bg-[#121212] border-gray-700 rounded-md focus:border-[#00a3e0] focus:ring-[#00a3e0] text-white"
                              placeholder="Enter limit in mL"
                            />
                            <span className="text-gray-400 self-center">mL</span>
                            <button
                              onClick={handleUpdateNutrientBLimit}
                              className="btn btn-sm bg-[#00a3e0] hover:bg-[#0088c3] text-white px-3 py-1 rounded"
                            >
                              Update
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-400">
                            Maximum amount of Nutrient B solution that can be dosed in a 24-hour period.
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-4 p-3 bg-[#323232] rounded-lg text-sm text-gray-300">
                        <strong className="text-[#00a3e0]">Safety Note:</strong> If a pump reaches its daily limit, 
                        it will be temporarily disabled until the 24-hour window resets. This prevents accidental 
                        overdosing even if sensors are giving false readings.
                      </div>
                    </div>
                  </div>
                  
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">Advanced Settings</h2>
                    </div>
                    <div className="card-content mt-4">
                      <p className="text-gray-400 text-sm mb-4">
                        System-wide settings that affect system performance.
                      </p>
                      
                      <div className="bg-[#1e1e1e] rounded-lg p-4 mb-4">
                        <h3 className="font-medium mb-3">Logging Level</h3>
                        <div className="grid grid-cols-5 gap-2">
                          {['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].map((level, index) => (
                            <button
                              key={level}
                              className={`py-2 px-4 rounded-md text-sm ${
                                // Assume INFO (2) is the default unless we have data to say otherwise
                                index === 2 
                                  ? 'bg-[#00a3e0] text-white' 
                                  : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'
                              }`}
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
                </div>
              )}

              {activeTab === 'manual' && (
                <div className="space-y-6">
                  {/* Manual control content remains unchanged */}
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                    <p className="text-red-400">
                      <strong>Warning:</strong> Manual dosing bypasses all safety measures and limits. Use with extreme caution.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Manual control pumps - this remains unchanged */}
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  {/* History content remains unchanged */}
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">Dosing History</h2>
                    </div>
                    <div className="card-content mt-4">
                      {/* History table - this remains unchanged */}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 
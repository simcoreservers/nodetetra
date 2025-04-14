"use client";

import { useState, ChangeEvent, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useDosingData, DosingHistoryEntry } from "../hooks/useDosingData";
import { useAutoDosing } from "../hooks/useAutoDosing";

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

  const { 
    data, 
    activeProfile,
    isLoading, 
    error, 
    refresh,
    updateDosingSchedule,
    updateDosingLimits
  } = useDosingData();

  // Add auto-dosing hook
  const {
    config: autoDoseConfig,
    isLoading: autoDoseLoading,
    error: autoDoseError,
    toggleEnabled: toggleAutoDosing,
    updateConfig: updateAutoDoseConfig,
    resetConfig: resetAutoDoseConfig,
    triggerDosing: triggerAutoDosing
  } = useAutoDosing();

  // Update local state when API data is loaded
  useEffect(() => {
    if (data) {
      setPhUpLimit(data.settings.dosingLimits.phUp);
      setPhDownLimit(data.settings.dosingLimits.phDown);
      setNutrientALimit(data.settings.dosingLimits.nutrientA);
      setNutrientBLimit(data.settings.dosingLimits.nutrientB);
    }
  }, [data]);

  // Update minInterval state from autodosing config
  useEffect(() => {
    if (autoDoseConfig) {
      setPhUpInterval(autoDoseConfig.dosing.phUp.minInterval);
      setPhDownInterval(autoDoseConfig.dosing.phDown.minInterval);
      
      // Set a default value for nutrient pumps (assuming all have the same interval)
      const nutrientPumpKeys = Object.keys(autoDoseConfig.dosing.nutrientPumps);
      if (nutrientPumpKeys.length > 0) {
        const firstPump = nutrientPumpKeys[0];
        setNutrientInterval(autoDoseConfig.dosing.nutrientPumps[firstPump].minInterval);
      } else {
        setNutrientInterval(180); // Default value
      }
    }
  }, [autoDoseConfig]);

  // Auto-sync the auto-dosing config with active profile when data changes
  useEffect(() => {
    if (data?.settings.targetPh && data?.settings.targetEc && autoDoseConfig && !autoDoseLoading) {
      const phTarget = (data.settings.targetPh.min + data.settings.targetPh.max) / 2;
      const phTolerance = (data.settings.targetPh.max - data.settings.targetPh.min) / 2;
      const ecTarget = (data.settings.targetEc.min + data.settings.targetEc.max) / 2;
      const ecTolerance = (data.settings.targetEc.max - data.settings.targetEc.min) / 2;
      
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
      // Create properly structured update object
      const updates: any = {};
      
      // Only include what needs to be updated
      if (phUpInterval !== "" && phUpInterval !== autoDoseConfig.dosing.phUp.minInterval) {
        if (!updates.dosing) updates.dosing = {};
        if (!updates.dosing.phUp) updates.dosing.phUp = {};
        updates.dosing.phUp.minInterval = Number(phUpInterval);
      }
      
      // Update pH Down interval if changed
      if (phDownInterval !== "" && phDownInterval !== autoDoseConfig.dosing.phDown.minInterval) {
        if (!updates.dosing) updates.dosing = {};
        if (!updates.dosing.phDown) updates.dosing.phDown = {};
        updates.dosing.phDown.minInterval = Number(phDownInterval);
      }
      
      // Update all nutrient pump intervals if changed
      if (nutrientInterval !== "") {
        if (!updates.dosing) updates.dosing = {};
        if (!updates.dosing.nutrientPumps) updates.dosing.nutrientPumps = {};
        
        // Set the same interval for all nutrient pumps
        Object.keys(autoDoseConfig.dosing.nutrientPumps).forEach(pumpName => {
          updates.dosing.nutrientPumps[pumpName] = {
            ...autoDoseConfig.dosing.nutrientPumps[pumpName],
            minInterval: Number(nutrientInterval)
          };
        });
      }
      
      console.log('Sending updates to server:', JSON.stringify(updates, null, 2));
      
      // Only update if there are actual changes
      if (Object.keys(updates).length > 0) {
        const result = await updateAutoDoseConfig(updates);
        console.log('Update result:', result);
      }
    }
  };

  // Remove pH and EC target update handlers

  const handleUpdatePhUpLimit = async () => {
    if (phUpLimit !== "") {
      await updateDosingLimits({ phUp: Number(phUpLimit) });
      refresh();
    }
  };

  const handleUpdatePhDownLimit = async () => {
    if (phDownLimit !== "") {
      await updateDosingLimits({ phDown: Number(phDownLimit) });
      refresh();
    }
  };

  const handleUpdateNutrientALimit = async () => {
    if (nutrientALimit !== "") {
      await updateDosingLimits({ nutrientA: Number(nutrientALimit) });
      refresh();
    }
  };

  const handleUpdateNutrientBLimit = async () => {
    if (nutrientBLimit !== "") {
      await updateDosingLimits({ nutrientB: Number(nutrientBLimit) });
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
  if (!data) {
    return (
      <div className="flex h-screen bg-[#121212] items-center justify-center">
        <div className="text-center">
          <p>No dosing data available</p>
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
    { id: 'schedule', label: 'Schedule' },
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
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Min pH:</span>
                  <span className="text-xl font-medium">{data?.settings.targetPh.min}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max pH:</span>
                  <span className="text-xl font-medium">{data?.settings.targetPh.max}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Current pH:</span>
                  <span className="text-xl font-medium">{data?.settings.targetPh.current}</span>
                </div>
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
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Min EC:</span>
                  <span className="text-xl font-medium">{data?.settings.targetEc.min} mS/cm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max EC:</span>
                  <span className="text-xl font-medium">{data?.settings.targetEc.max} mS/cm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Current EC:</span>
                  <span className="text-xl font-medium">{data?.settings.targetEc.current} mS/cm</span>
                </div>
                <div className="mt-4 p-3 bg-[#1e1e1e] rounded-lg">
                  <p className="text-sm text-gray-400">
                    <span className="text-[#00a3e0]">Note:</span> EC target range is controlled by the active plant profile. 
                    To change these settings, update your active profile.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="card mb-8">
            <div className="card-header">
              <h2 className="card-title">Dosing Schedule</h2>
            </div>
            <div className="mt-4 space-y-6">
              <div>
                <label className="block text-sm mb-3">Schedule Type</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button 
                    className={`btn ${data.settings.dosingSchedule === 'Continuous' ? '' : 'btn-secondary'}`}
                    onClick={() => updateDosingSchedule('Continuous')}
                  >
                    Continuous
                  </button>
                  <button 
                    className={`btn ${data.settings.dosingSchedule === 'Timed' ? '' : 'btn-secondary'}`}
                    onClick={() => updateDosingSchedule('Timed')}
                  >
                    Timed (Every X Hours)
                  </button>
                  <button 
                    className={`btn ${data.settings.dosingSchedule === 'Scheduled' ? '' : 'btn-secondary'}`}
                    onClick={() => updateDosingSchedule('Scheduled')}
                  >
                    Scheduled (Specific Times)
                  </button>
                </div>
              </div>
              
              <div className="border-t border-[#333333] pt-4">
                <label className="block text-sm mb-3">Maximum Daily Dosage Limits</label>
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
                  Auto-dosing automatically monitors your pH and EC levels and dispenses nutrients or pH adjusters as needed to maintain optimal conditions.
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
                                {data?.settings.targetPh ? 
                                  ((data.settings.targetPh.min + data.settings.targetPh.max) / 2).toFixed(2) : 
                                  autoDoseConfig.targets.ph.target.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">pH Tolerance (±):</span>
                              <span className="text-xl font-medium">
                                {data?.settings.targetPh ? 
                                  ((data.settings.targetPh.max - data.settings.targetPh.min) / 2).toFixed(2) : 
                                  autoDoseConfig.targets.ph.tolerance.toFixed(2)}
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
                                {data?.settings.targetEc ? 
                                  ((data.settings.targetEc.min + data.settings.targetEc.max) / 2).toFixed(2) : 
                                  autoDoseConfig.targets.ec.target.toFixed(2)} mS/cm
                              </span>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-400">EC Tolerance (±):</span>
                              <span className="text-xl font-medium">
                                {data?.settings.targetEc ? 
                                  ((data.settings.targetEc.max - data.settings.targetEc.min) / 2).toFixed(2) : 
                                  autoDoseConfig.targets.ec.tolerance.toFixed(2)} mS/cm
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
                          className="btn"
                          onClick={triggerAutoDosing}
                          disabled={autoDoseLoading || !autoDoseConfig.enabled}
                        >
                          Run Dosing Cycle Now
                        </button>
                        <button 
                          className="btn btn-secondary"
                          onClick={resetAutoDoseConfig}
                          disabled={autoDoseLoading}
                        >
                          Reset Settings
                        </button>
                      </div>
                      <div className="mt-3 p-3 bg-[#1e1e1e] rounded-lg">
                        <p className="text-sm text-gray-400">
                          <span className="text-[#00a3e0]">Note:</span> Auto-dosing targets are automatically synchronized with your active plant profile.
                        </p>
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
                  {data.history.map((event, index) => (
                    <tr key={index} className="border-b border-[#333333]">
                      <td className="py-3 text-sm text-gray-400">{event.timestamp}</td>
                      <td className="py-3">{event.details?.split(' ')[0] || 'Unknown'}</td>
                      <td className="py-3">{event.action}</td>
                    </tr>
                  ))}
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
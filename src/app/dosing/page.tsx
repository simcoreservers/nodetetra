"use client";

import { useState, ChangeEvent, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useDosingData } from "../hooks/useDosingData";

export default function DosingPage() {
  const [activeTab, setActiveTab] = useState<string>('settings');
  const [activeSection, setActiveSection] = useState<string>('dosing');
  const { collapsed } = useSidebar();
  
  // Form state for inputs (removing pH and EC states since they're from active profile)
  const [phUpLimit, setPhUpLimit] = useState<number | string>("");
  const [phDownLimit, setPhDownLimit] = useState<number | string>("");
  const [nutrientALimit, setNutrientALimit] = useState<number | string>("");
  const [nutrientBLimit, setNutrientBLimit] = useState<number | string>("");

  const { 
    data, 
    activeProfile,
    isLoading, 
    error, 
    refresh,
    updateDosingSchedule,
    updateDosingLimits
  } = useDosingData();

  // Update local state when API data is loaded
  useEffect(() => {
    if (data) {
      setPhUpLimit(data.settings.dosingLimits.phUp);
      setPhDownLimit(data.settings.dosingLimits.phDown);
      setNutrientALimit(data.settings.dosingLimits.nutrientA);
      setNutrientBLimit(data.settings.dosingLimits.nutrientB);
    }
  }, [data]);

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
                    className={`btn ${data.settings.dosingSchedule === 'Auto' ? '' : 'btn-secondary'}`}
                    onClick={() => updateDosingSchedule('Auto')}
                  >
                    Auto
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
                      <td className="py-3 text-sm text-gray-400">{event.time}</td>
                      <td className="py-3">{event.pump}</td>
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
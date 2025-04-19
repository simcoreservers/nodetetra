"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useSimulationContext } from "../components/SimulationContext";

// Console log for debugging
console.log("Settings page loaded");

// Mock data for UI demonstration
const mockData = {
  systemInfo: {
    version: "1.0.2",
    lastUpdated: "2023-09-15",
    deviceId: "NutetraX2023092",
    deviceName: "Main Hydroponic System",
    uptime: "15 days, 7 hours, 32 minutes"
  },
  network: {
    hostname: "nutetra.local",
    ipAddress: "192.168.1.100",
    macAddress: "A1:B2:C3:D4:E5:F6",
    connectionType: "WiFi",
    ssid: "Greenhouse_Network",
    signalStrength: "Excellent"
  },
  backup: {
    lastBackup: "2023-09-19 08:30",
    backupLocation: "Cloud Storage",
    autoBackup: true,
    backupFrequency: "Daily"
  }
};

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("settings");
  const [activeTab, setActiveTab] = useState("system");
  const { collapsed } = useSidebar();
  const { isEnabled, isLoading, toggleSimulation, resetSimulation, config, updateSimulationConfig } = useSimulationContext();
  
  // Form state for simulation parameters
  const [formState, setFormState] = useState({
    ph: 6.0,
    ec: 1.4,
    waterTemp: 22.0,
    phVariation: 0.05,
    ecVariation: 0.03,
    waterTempVariation: 0.2
  });
  
  // Update form with configuration from context when available
  useEffect(() => {
    if (config) {
      setFormState({
        ph: config.baseline.ph,
        ec: config.baseline.ec,
        waterTemp: config.baseline.waterTemp,
        phVariation: config.variation.ph,
        ecVariation: config.variation.ec,
        waterTempVariation: config.variation.waterTemp
      });
    }
  }, [config]);
  
  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
  };
  
  // Apply simulation parameter changes
  const handleApplyChanges = async () => {
    try {
      // Set up a loading state if not already
      if (!isLoading) setIsLoading(true);
      
      // Update just the baseline values (variations are ignored now)
      const result = await updateSimulationConfig({
        baseline: {
          ph: formState.ph,
          ec: formState.ec,
          waterTemp: formState.waterTemp
        },
        // Still send variation values to keep the API interface the same
        // but these won't actually be used in the simulation anymore
        variation: {
          ph: formState.phVariation,
          ec: formState.ecVariation,
          waterTemp: formState.waterTempVariation
        }
      });
      
      if (result) {
        // Show a success message
        alert("Simulation values updated. The system will now use these exact values for all sensor readings when simulation is enabled.");
      }
    } catch (error) {
      console.error('Error updating simulation values:', error);
      alert(`Failed to update simulation values: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">System Settings</h1>
          <div className="flex items-center">
            <button className="btn btn-danger mr-2">Restart System</button>
            <button className="btn">Check for Updates</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[#333333]">
          <div className="flex">
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'system' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`} 
              onClick={() => setActiveTab('system')}
            >
              System Info
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'network' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`}
              onClick={() => setActiveTab('network')}
            >
              Network Settings
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'simulation' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`}
              onClick={() => setActiveTab('simulation')}
            >
              Simulation
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'backup' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`}
              onClick={() => setActiveTab('backup')}
            >
              Backup & Restore
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'firmware' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`}
              onClick={() => setActiveTab('firmware')}
            >
              Firmware Update
            </button>
          </div>
        </div>

        {/* System Info */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="card-title mb-4">System Information</h2>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">System Version</span>
                  <span>{mockData.systemInfo.version}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Last Updated</span>
                  <span>{mockData.systemInfo.lastUpdated}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Device ID</span>
                  <span>{mockData.systemInfo.deviceId}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">System Uptime</span>
                  <span>{mockData.systemInfo.uptime}</span>
                </div>
              </div>
              <div className="mt-4">
                <button className="btn w-full">Generate System Report</button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-4">Device Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Device Name</label>
                  <div className="flex">
                    <input 
                      type="text" 
                      className="flex-1 bg-[#1e1e1e] border border-[#333333] rounded-l p-2"
                      defaultValue={mockData.systemInfo.deviceName}
                    />
                    <button className="btn rounded-l-none">Update</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-2">Time Zone</label>
                  <select className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2">
                    <option>America/New_York (UTC-04:00)</option>
                    <option>America/Chicago (UTC-05:00)</option>
                    <option>America/Denver (UTC-06:00)</option>
                    <option>America/Los_Angeles (UTC-07:00)</option>
                    <option>Europe/London (UTC+00:00)</option>
                    <option>Europe/Paris (UTC+01:00)</option>
                    <option>Asia/Tokyo (UTC+09:00)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Date Format</label>
                  <select className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2">
                    <option>YYYY-MM-DD</option>
                    <option>MM/DD/YYYY</option>
                    <option>DD/MM/YYYY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Temperature Unit</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input type="radio" name="tempUnit" defaultChecked className="mr-2" />
                      <span>Celsius (°C)</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="tempUnit" className="mr-2" />
                      <span>Fahrenheit (°F)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Network Settings */}
        {activeTab === 'network' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="card-title mb-4">Current Network Status</h2>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Hostname</span>
                  <span>{mockData.network.hostname}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">IP Address</span>
                  <span>{mockData.network.ipAddress}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">MAC Address</span>
                  <span>{mockData.network.macAddress}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Connection Type</span>
                  <span>{mockData.network.connectionType}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">WiFi Network (SSID)</span>
                  <span>{mockData.network.ssid}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Signal Strength</span>
                  <span>{mockData.network.signalStrength}</span>
                </div>
              </div>
              <div className="mt-4">
                <button className="btn w-full">Refresh Network Status</button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-4">WiFi Configuration</h2>
              <div className="space-y-4">
                <div className="mb-4">
                  <label className="block text-sm mb-2">WiFi Networks</label>
                  <select className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2 mb-2">
                    <option>Greenhouse_Network</option>
                    <option>Home_WiFi</option>
                    <option>Office_Network</option>
                    <option>Guest_Network</option>
                  </select>
                  <button className="btn btn-secondary w-full">Scan for Networks</button>
                </div>
                <div>
                  <label className="block text-sm mb-2">WiFi Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                    placeholder="Enter WiFi password"
                    value="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">IP Configuration</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input type="radio" name="ipConfig" defaultChecked className="mr-2" />
                      <span>DHCP (Automatic)</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="ipConfig" className="mr-2" />
                      <span>Static IP</span>
                    </label>
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <button className="btn">Connect</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Simulation Settings */}
        {activeTab === 'simulation' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="card-title">Simulation Control</h2>
                <div className="flex items-center">
                  <span className="mr-2 text-sm">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                  <button
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
                      isEnabled ? 'bg-green-500' : 'bg-gray-700'
                    }`}
                    onClick={toggleSimulation}
                    disabled={isLoading}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                        isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Enable simulation mode to override hardware sensors with static simulated data.
                The exact values you configure will be used without variation, which is ideal for testing
                specific scenarios and calibrating your auto-dosing system.
              </p>
              <div className="bg-green-900/30 border border-green-700 rounded-md p-3 mb-4 text-green-300">
                <div className="flex items-start">
                  <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm">Simulation mode now uses static values that won't change over time. Perfect for auto-dosing tests and calibration.</p>
                </div>
              </div>
              <div className="space-y-4 mt-6">
                <div className="border-t border-[#333333] pt-4">
                  <h3 className="text-md font-medium mb-3">Simulation Tools</h3>
                  <button 
                    className="btn btn-secondary w-full mb-2"
                    onClick={resetSimulation}
                    disabled={isLoading}
                  >
                    Reset to Configured Values
                  </button>
                  <p className="text-xs text-gray-400 italic mb-2">
                    This will reset any temporary changes back to your configured baseline values.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="card">
              <h2 className="card-title mb-4">Simulation Parameters</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-md font-medium mb-3">Baseline Values</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-2">pH Baseline</label>
                      <input 
                        type="number" 
                        name="ph"
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={formState.ph}
                        onChange={handleInputChange}
                        min="0"
                        max="14"
                        step="0.1"
                        disabled={isLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2">EC Baseline (mS/cm)</label>
                      <input 
                        type="number" 
                        name="ec"
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={formState.ec}
                        onChange={handleInputChange}
                        min="0"
                        max="5"
                        step="0.1"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm mb-2">Temperature Baseline (°C)</label>
                    <input 
                      type="number" 
                      name="waterTemp"
                      className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                      value={formState.waterTemp}
                      onChange={handleInputChange}
                      min="10"
                      max="40"
                      step="0.5"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                
                <div className="border-t border-[#333333] pt-4">
                  <h3 className="text-md font-medium mb-3">Static Value Mode</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Simulation values are now set to static mode. The exact values you configure 
                    above will be used without any variation or drift.
                  </p>
                  <div className="bg-blue-900/30 border border-blue-700 rounded-md p-3 mb-3 text-blue-300">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <p className="text-sm">The variation and drift settings are disabled since simulated values are now static.</p>
                    </div>
                  </div>
                  <div className="space-y-3 opacity-50">
                    <div className="flex justify-between">
                      <span>pH Variation (Disabled)</span>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-400 mr-2">±{formState.phVariation}</span>
                        <input 
                          type="range" 
                          name="phVariation"
                          min="0.01" 
                          max="0.2" 
                          step="0.01" 
                          value={formState.phVariation}
                          onChange={handleInputChange}
                          disabled={true}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span>EC Variation (Disabled)</span>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-400 mr-2">±{formState.ecVariation}</span>
                        <input 
                          type="range" 
                          name="ecVariation"
                          min="0.01" 
                          max="0.2" 
                          step="0.01"
                          value={formState.ecVariation}
                          onChange={handleInputChange}
                          disabled={true}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span>Temperature Variation (Disabled)</span>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-400 mr-2">±{formState.waterTempVariation}°C</span>
                        <input 
                          type="range" 
                          name="waterTempVariation"
                          min="0.1" 
                          max="1" 
                          step="0.1"
                          value={formState.waterTempVariation}
                          onChange={handleInputChange}
                          disabled={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-[#333333]">
                  <button 
                    className="btn w-full"
                    onClick={handleApplyChanges}
                    disabled={isLoading}
                  >
                    Apply Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Backup & Restore */}
        {activeTab === 'backup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <h2 className="card-title mb-4">Backup Settings</h2>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Last Backup</span>
                  <span>{mockData.backup.lastBackup}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Backup Location</span>
                  <span>{mockData.backup.backupLocation}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Auto Backup</span>
                  <span>{mockData.backup.autoBackup ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between border-b border-[#333333] pb-2">
                  <span className="text-gray-400">Backup Frequency</span>
                  <span>{mockData.backup.backupFrequency}</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <button className="btn w-full">Create Backup Now</button>
                <button className="btn btn-secondary w-full">Configure Auto-Backup</button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-4">Restore System</h2>
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Select a previous backup to restore your system configuration. 
                  This will restore all settings, sensor calibrations, and schedules.
                </p>
                <div>
                  <label className="block text-sm mb-2">Available Backups</label>
                  <select className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2">
                    <option>Backup 2023-09-19 08:30</option>
                    <option>Backup 2023-09-18 08:30</option>
                    <option>Backup 2023-09-17 08:30</option>
                    <option>Backup 2023-09-16 08:30</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-2">Or Upload Backup File</label>
                  <div className="flex">
                    <input 
                      type="text" 
                      className="flex-1 bg-[#1e1e1e] border border-[#333333] rounded-l p-2"
                      placeholder="Select file"
                      disabled
                    />
                    <button className="btn rounded-l-none">Browse</button>
                  </div>
                </div>
                <div className="pt-4 border-t border-[#333333]">
                  <button className="btn btn-danger w-full">Restore From Backup</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Firmware Update */}
        {activeTab === 'firmware' && (
          <div className="card mb-8">
            <h2 className="card-title mb-4">Firmware Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-3">Current Firmware</h3>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-[#333333] pb-2">
                    <span className="text-gray-400">Version</span>
                    <span>{mockData.systemInfo.version}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#333333] pb-2">
                    <span className="text-gray-400">Released</span>
                    <span>{mockData.systemInfo.lastUpdated}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#333333] pb-2">
                    <span className="text-gray-400">Status</span>
                    <span className="text-green-400">Up to date</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <button className="btn w-full">Check for Updates</button>
                  <button className="btn btn-secondary w-full">View Release Notes</button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-3">Manual Update</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Upload a firmware file (.bin) to manually update your system.
                  Only use official firmware files from NuTetra.
                </p>
                <div className="mb-4">
                  <label className="block text-sm mb-2">Firmware File</label>
                  <div className="flex">
                    <input 
                      type="text" 
                      className="flex-1 bg-[#1e1e1e] border border-[#333333] rounded-l p-2"
                      placeholder="Select firmware file"
                      disabled
                    />
                    <button className="btn rounded-l-none">Browse</button>
                  </div>
                </div>
                <div className="pt-4 border-t border-[#333333]">
                  <p className="text-sm text-yellow-400 mb-3">
                    ⚠️ Warning: Updating firmware may reset your system. Make sure to back up your settings first.
                  </p>
                  <button className="btn btn-danger w-full">Upload & Install Firmware</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
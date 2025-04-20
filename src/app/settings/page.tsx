"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useSimulationContext } from "../components/SimulationContext";
import { useNetwork } from "../components/NetworkContext";
import { Input } from "@/components/ui/keyboard";
import KeyboardTest from "@/components/ui/keyboard/KeyboardTest";

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
  const { isEnabled, isLoading: simLoading, toggleSimulation, resetSimulation, config, updateSimulationConfig } = useSimulationContext();
  const { networkStatus, availableNetworks, isLoading: networkLoading, isScanning, isConnecting, scanForNetworks, connectToNetwork, updateDeviceHostname, refreshNetworkStatus } = useNetwork();
  
  // Form state for simulation parameters
  const [formState, setFormState] = useState({
    ph: 6.0,
    ec: 1.4,
    waterTemp: 22.0,
    phVariation: 0.05,
    ecVariation: 0.03,
    waterTempVariation: 0.2
  });
  
  // Network form state
  const [networkFormState, setNetworkFormState] = useState({
    hostname: networkStatus?.hostname || "",
    ssid: "",
    password: "",
    ipConfig: "dhcp",
    staticIp: {
      ipAddress: "",
      gateway: "",
      subnet: "",
      dns: ""
    }
  });
  
  // Scan for networks on initial load
  useEffect(() => {
    if (activeTab === 'network' && availableNetworks.length === 0 && !isScanning) {
      scanForNetworks().catch(error => {
        console.error("Failed to scan for networks:", error);
      });
    }
  }, [activeTab, availableNetworks.length, isScanning, scanForNetworks]);
  
  // Update network form state when network status changes
  useEffect(() => {
    if (networkStatus) {
      setNetworkFormState(prev => ({
        ...prev,
        hostname: networkStatus.hostname
      }));
    }
  }, [networkStatus]);
  
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
  
  // Trigger a WiFi scan when switching to the network tab
  useEffect(() => {
    if (activeTab === 'network') {
      console.log('Network tab selected, scanning for networks...');
      scanForNetworks().catch(error => {
        console.error('Failed to scan for networks:', error);
      });
    }
  }, [activeTab, scanForNetworks]);
  
  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
  };
  
  // Handle network form input changes
  const handleNetworkInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNetworkFormState(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle hostname update
  const handleHostnameUpdate = async () => {
    if (!networkFormState.hostname) return;
    
    try {
      await updateDeviceHostname(networkFormState.hostname);
      alert("Hostname updated successfully");
    } catch (error) {
      console.error("Failed to update hostname:", error);
      alert("Failed to update hostname");
    }
  };
  
  // Handle WiFi connect
  const handleWifiConnect = async () => {
    if (!networkFormState.ssid) return;
    
    try {
      const useStaticIp = networkFormState.ipConfig === "static";
      const staticIpConfig = useStaticIp ? networkFormState.staticIp : undefined;
      
      await connectToNetwork(
        networkFormState.ssid,
        networkFormState.password,
        useStaticIp,
        staticIpConfig
      );
      
      // Refresh network status to show the new connection
      await refreshNetworkStatus();
      
      // Clear the password field after successful connection
      setNetworkFormState(prev => ({
        ...prev,
        password: ""
      }));
      
      alert(`Successfully connected to ${networkFormState.ssid}`);
    } catch (error) {
      console.error("Failed to connect to network:", error);
      alert(`Failed to connect to network: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Apply simulation parameter changes
  const handleApplyChanges = async () => {
    try {
      // No need to set loading state manually - updateSimulationConfig handles this internally
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

  // Handle refresh network status
  const handleRefreshNetworkStatus = async () => {
    try {
      await refreshNetworkStatus();
      await scanForNetworks();
    } catch (error) {
      console.error("Failed to refresh network status:", error);
      alert("Failed to refresh network status");
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
        
        {/* Keyboard test component */}
        <KeyboardTest />

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
                  <label className="block text-sm mb-2">Hostname</label>
                  <div className="flex">
                  <Input 
                  type="text" 
                  className="flex-1 rounded-l"
                  value={networkFormState.hostname}
                    onChange={(value) => setNetworkFormState(prev => ({ ...prev, hostname: value }))}
                    placeholder="nutetra"
                      />
                      <button 
                        className="btn rounded-l-none"
                        onClick={handleHostnameUpdate}
                        disabled={!networkFormState.hostname || networkLoading}
                      >
                        {networkLoading ? 'Updating...' : 'Update'}
                      </button>
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
              {networkLoading ? (
                <div className="flex justify-center items-center h-48">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : !networkStatus ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Network status unavailable</p>
                  <button className="btn w-full" onClick={handleRefreshNetworkStatus}>
                    Refresh Network Status
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">Hostname</span>
                      <span>{networkStatus.hostname}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">IP Address</span>
                      <span>{networkStatus.ipAddress}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">MAC Address</span>
                      <span>{networkStatus.macAddress}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">Connection Type</span>
                      <span>{networkStatus.connectionType}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">WiFi Network (SSID)</span>
                      <span>{networkStatus.ssid}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">Signal Strength</span>
                      <span>{networkStatus.signalStrength}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#333333] pb-2">
                      <span className="text-gray-400">Last Updated</span>
                      <span>{new Date(networkStatus.lastUpdated).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button 
                      className="btn w-full" 
                      onClick={handleRefreshNetworkStatus}
                      disabled={networkLoading}
                    >
                      {networkLoading ? 'Refreshing...' : 'Refresh Network Status'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2 className="card-title mb-4">WiFi Configuration</h2>
              <div className="space-y-4">
                <div className="mb-4">
                  <label className="block text-sm mb-2">WiFi Networks</label>
                  <select 
                    className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2 mb-2"
                    name="ssid"
                    value={networkFormState.ssid}
                    onChange={handleNetworkInputChange}
                    disabled={isScanning || isConnecting}
                  >
                    <option value="">Select a network...</option>
                    {availableNetworks.map((network) => (
                      <option key={network.ssid} value={network.ssid}>
                        {network.ssid} {network.connected ? '(Connected)' : ''} - Signal: {Math.abs(network.signalStrength)}dBm
                      </option>
                    ))}
                  </select>
                  <button 
                    className="btn w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={scanForNetworks}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <span className="flex items-center justify-center">
                        <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                        Scanning for Networks...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center">
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8.5 12.5C8.5 10.5 10 9 12 9C14 9 15.5 10.5 15.5 12.5C15.5 14.5 14 16 12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 16V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 9C8.13401 9 5 12.134 5 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 5C14.1217 5 16.1566 5.84285 17.6569 7.34315C19.1571 8.84344 20 10.8783 20 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M4 13C4 9.5 6 6.5 9 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Scan for WiFi Networks
                      </span>
                    )}
                  </button>
                  {availableNetworks.length === 0 && !isScanning && (
                    <div className="mt-2 p-3 border border-yellow-600 bg-yellow-600/20 rounded">
                      <p className="text-yellow-500 text-sm flex items-center">
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 17.01L12.01 16.9989" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        No WiFi networks found. Make sure WiFi is enabled and click "Scan for WiFi Networks" button to search for available networks.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm mb-2">WiFi Password</label>
                  <Input 
                    type="password" 
                    className="w-full"
                    placeholder="Enter WiFi password"
                    name="password"
                    value={networkFormState.password}
                    onChange={(value) => setNetworkFormState(prev => ({ ...prev, password: value }))}
                    disabled={isConnecting || !networkFormState.ssid}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-2">IP Configuration</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input 
                        type="radio" 
                        name="ipConfig" 
                        value="dhcp" 
                        checked={networkFormState.ipConfig === "dhcp"} 
                        onChange={handleNetworkInputChange} 
                        className="mr-2" 
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                      <span>DHCP (Automatic)</span>
                    </label>
                    <label className="flex items-center">
                      <input 
                        type="radio" 
                        name="ipConfig" 
                        value="static" 
                        checked={networkFormState.ipConfig === "static"} 
                        onChange={handleNetworkInputChange} 
                        className="mr-2" 
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                      <span>Static IP</span>
                    </label>
                  </div>
                </div>
                
                {networkFormState.ipConfig === "static" && (
                  <div className="space-y-3 mt-2 p-3 border border-[#333333] rounded">
                    <div>
                      <label className="block text-sm mb-1">IP Address</label>
                      <Input
                        type="text"
                        name="ipAddress"
                        className="w-full"
                        placeholder="192.168.1.x"
                        value={networkFormState.staticIp.ipAddress}
                        onChange={(value) => 
                          setNetworkFormState(prev => ({
                            ...prev,
                            staticIp: { ...prev.staticIp, ipAddress: value }
                          }))
                        }
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Gateway</label>
                      <Input
                        type="text"
                        name="gateway"
                        className="w-full"
                        placeholder="192.168.1.1"
                        value={networkFormState.staticIp.gateway}
                        onChange={(value) => 
                          setNetworkFormState(prev => ({
                            ...prev,
                            staticIp: { ...prev.staticIp, gateway: value }
                          }))
                        }
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Subnet Mask</label>
                      <Input
                        type="text"
                        name="subnet"
                        className="w-full"
                        placeholder="255.255.255.0"
                        value={networkFormState.staticIp.subnet}
                        onChange={(value) => 
                          setNetworkFormState(prev => ({
                            ...prev,
                            staticIp: { ...prev.staticIp, subnet: value }
                          }))
                        }
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">DNS Server</label>
                      <Input
                        type="text"
                        name="dns"
                        className="w-full"
                        placeholder="8.8.8.8"
                        value={networkFormState.staticIp.dns}
                        onChange={(value) => 
                          setNetworkFormState(prev => ({
                            ...prev,
                            staticIp: { ...prev.staticIp, dns: value }
                          }))
                        }
                        disabled={isConnecting || !networkFormState.ssid}
                      />
                    </div>
                  </div>
                )}
                
                <div className="pt-4 flex justify-end">
                  <button 
                    className="btn"
                    onClick={handleWifiConnect}
                    disabled={isConnecting || !networkFormState.ssid}
                  >
                    {isConnecting ? (
                      <span className="flex items-center justify-center">
                        <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-blue-500 rounded-full"></span>
                        Connecting...
                      </span>
                    ) : 'Connect'}
                  </button>
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
                    disabled={simLoading}
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
              <div className="space-y-4 mt-6">
                <div className="border-t border-[#333333] pt-4">
                  <h3 className="text-md font-medium mb-3">Simulation Tools</h3>
                  <button 
                    className="btn btn-secondary w-full mb-2"
                    onClick={resetSimulation}
                    disabled={simLoading}
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
                      <Input 
                        type="number" 
                        name="ph"
                        className="w-full"
                        value={formState.ph}
                        onChange={(value) => handleInputChange({
                          target: { name: 'ph', value }
                        } as React.ChangeEvent<HTMLInputElement>)}
                        min="0"
                        max="14"
                        step="0.1"
                        disabled={simLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2">EC Baseline (mS/cm)</label>
                      <Input 
                        type="number" 
                        name="ec"
                        className="w-full"
                        value={formState.ec}
                        onChange={(value) => handleInputChange({
                          target: { name: 'ec', value }
                        } as React.ChangeEvent<HTMLInputElement>)}
                        min="0"
                        max="5"
                        step="0.1"
                        disabled={simLoading}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm mb-2">Temperature Baseline (°C)</label>
                    <Input 
                      type="number" 
                      name="waterTemp"
                      className="w-full"
                      value={formState.waterTemp}
                      onChange={(value) => handleInputChange({
                        target: { name: 'waterTemp', value }
                      } as React.ChangeEvent<HTMLInputElement>)}
                      min="10"
                      max="40"
                      step="0.5"
                      disabled={simLoading}
                    />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-[#333333]">
                  <button 
                    className="btn w-full"
                    onClick={handleApplyChanges}
                    disabled={simLoading}
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
                    <Input 
                      type="text" 
                      className="flex-1 rounded-l"
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
                    <Input 
                      type="text" 
                      className="flex-1 rounded-l"
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
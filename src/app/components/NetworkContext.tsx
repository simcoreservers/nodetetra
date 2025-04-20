"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  getNetworkStatus, 
  scanWifiNetworks, 
  connectToWifi, 
  updateHostname,
  updateNetworkConfig
} from '@/services/networkService';

// Define types for network state
interface NetworkStatus {
  hostname: string;
  ipAddress: string;
  macAddress: string;
  connectionType: string;
  ssid: string;
  signalStrength: string;
  connected: boolean;
  lastUpdated: string;
}

interface WiFiNetwork {
  ssid: string;
  signalStrength: number;
  security: string;
  connected: boolean;
}

interface StaticIpConfig {
  ipAddress: string;
  gateway: string;
  subnet: string;
  dns: string;
}

// Define context interface
interface NetworkContextInterface {
  networkStatus: NetworkStatus | null;
  availableNetworks: WiFiNetwork[];
  isLoading: boolean;
  isScanning: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  refreshNetworkStatus: () => Promise<void>;
  scanForNetworks: () => Promise<void>;
  connectToNetwork: (ssid: string, password: string, useStaticIp: boolean, staticIpConfig?: StaticIpConfig) => Promise<void>;
  updateDeviceHostname: (hostname: string) => Promise<void>;
}

// Create the context with default values
const NetworkContext = createContext<NetworkContextInterface>({
  networkStatus: null,
  availableNetworks: [],
  isLoading: false,
  isScanning: false,
  isConnecting: false,
  connectionError: null,
  refreshNetworkStatus: async () => {},
  scanForNetworks: async () => {},
  connectToNetwork: async () => {},
  updateDeviceHostname: async () => {}
});

// Custom hook to use the network context
export const useNetwork = () => useContext(NetworkContext);

// Provider component
interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [availableNetworks, setAvailableNetworks] = useState<WiFiNetwork[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Fetch network status on component mount
  useEffect(() => {
    const fetchNetworkStatus = async () => {
      try {
        setIsLoading(true);
        const status = await getNetworkStatus();
        setNetworkStatus(status);
      } catch (error) {
        console.error('Error fetching network status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNetworkStatus();
  }, []);

  // Function to refresh network status
  const refreshNetworkStatus = async () => {
    try {
      setIsLoading(true);
      const status = await getNetworkStatus();
      setNetworkStatus(status);
      return status;
    } catch (error) {
      console.error('Error refreshing network status:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to scan for WiFi networks
  const scanForNetworks = async () => {
    try {
      setIsScanning(true);
      setConnectionError(null);
      const networks = await scanWifiNetworks();
      setAvailableNetworks(networks);
    } catch (error) {
      console.error('Error scanning networks:', error);
      setConnectionError('Failed to scan for networks');
      throw error;
    } finally {
      setIsScanning(false);
    }
  };

  // Function to connect to a WiFi network
  const connectToNetwork = async (
    ssid: string, 
    password: string, 
    useStaticIp: boolean, 
    staticIpConfig?: StaticIpConfig
  ) => {
    try {
      setIsConnecting(true);
      setConnectionError(null);
      const result = await connectToWifi(ssid, password, useStaticIp, staticIpConfig);
      
      // Update network status with new connection details
      await refreshNetworkStatus();
      
      // Update available networks to show the connected network
      setAvailableNetworks(prevNetworks => 
        prevNetworks.map(network => ({
          ...network,
          connected: network.ssid === ssid
        }))
      );

      return result;
    } catch (error: any) {
      console.error('Error connecting to network:', error);
      setConnectionError(error?.message || 'Failed to connect to network');
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Function to update device hostname
  const updateDeviceHostname = async (hostname: string) => {
    try {
      setIsLoading(true);
      const result = await updateHostname(hostname);
      
      // Update network status with new hostname
      if (result.success && networkStatus) {
        setNetworkStatus({
          ...networkStatus,
          hostname: result.hostname
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error updating hostname:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Create the context value object
  const contextValue: NetworkContextInterface = {
    networkStatus,
    availableNetworks,
    isLoading,
    isScanning,
    isConnecting,
    connectionError,
    refreshNetworkStatus,
    scanForNetworks,
    connectToNetwork,
    updateDeviceHostname
  };

  // Provide the context to children
  return (
    <NetworkContext.Provider value={contextValue}>
      {children}
    </NetworkContext.Provider>
  );
};

export default NetworkContext;

/**
 * Network Service
 * 
 * Provides functions for retrieving and updating network settings
 * for the NuTetra system.
 */

// Function to get current network status
export async function getNetworkStatus() {
  try {
    // Call the API endpoint to get current network status
    const response = await fetch('/api/network/status');
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch network status');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching network status:', error);
    throw error;
  }
}

// Function to scan for available WiFi networks
export async function scanWifiNetworks() {
  try {
    // Call the API endpoint to scan for WiFi networks
    const response = await fetch('/api/network/scan');
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to scan for WiFi networks');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error scanning WiFi networks:', error);
    throw error;
  }
}

// Function to connect to a WiFi network
export async function connectToWifi(ssid, password, useStaticIp = false, staticIpConfig = null) {
  try {
    // Call the API endpoint to connect to WiFi
    const response = await fetch('/api/network/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, password, useStaticIp, staticIpConfig })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to connect to WiFi');
    }
    
    return data;
  } catch (error) {
    console.error('Error connecting to WiFi:', error);
    throw error;
  }
}

// Function to update hostname
export async function updateHostname(hostname) {
  try {
    // Call the API endpoint to update hostname
    const response = await fetch('/api/network/hostname', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update hostname');
    }
    
    return data;
  } catch (error) {
    console.error('Error updating hostname:', error);
    throw error;
  }
}

// Function to update network configuration
export async function updateNetworkConfig(config) {
  try {
    // In production, this would call an API endpoint to update network config
    // Example: const response = await fetch('/api/network/config', {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(config)
    // });
    
    // For demonstration, we'll simulate updating with a delay
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: "Network configuration updated successfully",
          config
        });
      }, 1000);
    });
  } catch (error) {
    console.error('Error updating network configuration:', error);
    throw error;
  }
}

// API route for network status
// Implementation retrieves real network status from the system

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execPromise = promisify(exec);

// Function to get the current WiFi SSID and signal strength
async function getWifiInfo() {
  const platform = process.platform;
  let ssid = '';
  let signalStrength = '';
  let connected = false;
  
  try {
    if (platform === 'win32') {
      // Windows: Use netsh to get WiFi info
      const { stdout } = await execPromise('netsh wlan show interfaces');
      
      // Extract SSID
      const ssidMatch = stdout.match(/SSID\s+:\s+(.+)/);
      if (ssidMatch && ssidMatch[1]) {
        ssid = ssidMatch[1].trim();
        connected = true;
        
        // Extract signal strength
        const signalMatch = stdout.match(/Signal\s+:\s+(\d+)%/);
        if (signalMatch && signalMatch[1]) {
          const signalPercent = parseInt(signalMatch[1]);
          if (signalPercent > 80) {
            signalStrength = "Excellent";
          } else if (signalPercent > 60) {
            signalStrength = "Good";
          } else if (signalPercent > 40) {
            signalStrength = "Fair";
          } else {
            signalStrength = "Poor";
          }
        }
      }
    } else if (platform === 'linux') {
      // Linux: Use nmcli to get WiFi info
      try {
        const { stdout } = await execPromise('nmcli -t -f SSID,SIGNAL,IN-USE device wifi list');
        const lines = stdout.split('\n').filter(Boolean);
        
        // Find the connected network (marked with *)
        for (const line of lines) {
          const [networkSsid, signalStr, inUse] = line.split(':');
          if (inUse === '*') {
            ssid = networkSsid;
            connected = true;
            
            // Convert signal strength to text
            const signal = parseInt(signalStr || '0');
            if (signal > 80) {
              signalStrength = "Excellent";
            } else if (signal > 60) {
              signalStrength = "Good";
            } else if (signal > 40) {
              signalStrength = "Fair";
            } else {
              signalStrength = "Poor";
            }
            
            break;
          }
        }
        
        // If no connected network found in scan, try checking connection info
        if (!ssid) {
          const { stdout: connInfo } = await execPromise('nmcli -t -f NAME,TYPE connection show --active');
          const connections = connInfo.split('\n').filter(Boolean);
          
          for (const conn of connections) {
            const [name, type] = conn.split(':');
            if (type === 'wifi' || type === '802-11-wireless') {
              ssid = name;
              connected = true;
              signalStrength = "Unknown"; // Can't determine without additional commands
              break;
            }
          }
        }
      } catch (error) {
        // Fallback to iwconfig if nmcli fails
        const { stdout } = await execPromise('iwconfig 2>/dev/null | grep ESSID');
        const essidMatch = stdout.match(/ESSID:"(.+?)"/);
        
        if (essidMatch && essidMatch[1]) {
          ssid = essidMatch[1];
          connected = true;
          
          // Try to get signal strength
          const { stdout: signalInfo } = await execPromise('iwconfig 2>/dev/null | grep "Signal level"');
          const signalMatch = signalInfo.match(/Signal level=(-\d+) dBm/);
          
          if (signalMatch && signalMatch[1]) {
            const signalDBm = parseInt(signalMatch[1]);
            
            if (signalDBm > -50) {
              signalStrength = "Excellent";
            } else if (signalDBm > -60) {
              signalStrength = "Good";
            } else if (signalDBm > -70) {
              signalStrength = "Fair";
            } else {
              signalStrength = "Poor";
            }
          } else {
            signalStrength = "Unknown";
          }
        }
      }
    } else if (platform === 'darwin') {
      // macOS: Use airport command to get WiFi info
      try {
        const { stdout } = await execPromise('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I');
        
        // Extract SSID
        const ssidMatch = stdout.match(/\s+SSID:\s+(.+)/);
        if (ssidMatch && ssidMatch[1]) {
          ssid = ssidMatch[1].trim();
          connected = true;
          
          // Extract signal strength (agrCtlRSSI)
          const rssiMatch = stdout.match(/agrCtlRSSI:\s+(-\d+)/);
          if (rssiMatch && rssiMatch[1]) {
            const rssi = parseInt(rssiMatch[1]);
            
            if (rssi > -50) {
              signalStrength = "Excellent";
            } else if (rssi > -60) {
              signalStrength = "Good";
            } else if (rssi > -70) {
              signalStrength = "Fair";
            } else {
              signalStrength = "Poor";
            }
          }
        }
      } catch (error) {
        console.error('Error getting macOS WiFi info:', error);
      }
    }
  } catch (error) {
    console.error('Error getting WiFi info:', error);
  }
  
  return { ssid, signalStrength, connected };
}

// GET handler for network status
export async function GET() {
  try {
    // Get hostname
    const hostname = os.hostname();
    
    // Get network interfaces
    const interfaces = os.networkInterfaces();
    let ipAddress = '';
    let macAddress = '';
    let connectionType = 'Ethernet';
    
    // Find the active network interface
    // Usually we're interested in the non-internal interface with an IPv4 address
    Object.keys(interfaces).forEach((ifaceName) => {
      const iface = interfaces[ifaceName];
      
      if (iface) {
        for (const addr of iface) {
          // Skip internal interfaces
          if (!addr.internal && addr.family === 'IPv4') {
            ipAddress = addr.address;
            macAddress = addr.mac;
            
            // Determine if this is likely WiFi or Ethernet
            if (ifaceName.toLowerCase().includes('wlan') || 
                ifaceName.toLowerCase().includes('wi-fi') || 
                ifaceName.toLowerCase().includes('wireless')) {
              connectionType = 'WiFi';
            }
            
            // Once we find a valid interface, we can stop searching
            if (ipAddress && macAddress) {
              break;
            }
          }
        }
      }
      
      // If we've found both IP and MAC, we can stop
      if (ipAddress && macAddress) {
        return;
      }
    });
    
    // Get WiFi information if connection type is WiFi
    let wifiInfo = { ssid: '', signalStrength: '', connected: false };
    if (connectionType === 'WiFi') {
      wifiInfo = await getWifiInfo();
    }
    
    // Create network status object
    const networkStatus = {
      hostname,
      ipAddress: ipAddress || '0.0.0.0',
      macAddress: macAddress || '00:00:00:00:00:00',
      connectionType,
      ssid: wifiInfo.ssid || 'Not connected',
      signalStrength: wifiInfo.signalStrength || 'N/A',
      connected: wifiInfo.connected,
      lastUpdated: new Date().toISOString()
    };
    
    return NextResponse.json(networkStatus);
  } catch (error) {
    console.error('Error retrieving network status:', error);
    return NextResponse.json(
      { error: `Failed to retrieve network status: ${error.message}` },
      { status: 500 }
    );
  }
}

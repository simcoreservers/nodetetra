// API route for scanning WiFi networks
// Implementation for Raspberry Pi / Linux systems

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Cache to store scan results and reduce unnecessary scans
let cachedNetworks = null;
let lastScanTime = 0;
const SCAN_CACHE_DURATION = 10000; // 10 seconds in milliseconds

// Function to scan for WiFi networks on Raspberry Pi / Linux
async function scanWifiNetworks(forceScan = false) {
  try {
    // Check if we have recent cached results
    const now = Date.now();
    if (!forceScan && cachedNetworks && (now - lastScanTime < SCAN_CACHE_DURATION)) {
      console.log('Returning cached scan results, age:', (now - lastScanTime) / 1000, 'seconds');
      return cachedNetworks;
    }
    
    console.log('Scanning for WiFi networks on Raspberry Pi / Linux');
    let networks = [];
    let command = '';
    
    // Try to force a rescan to get fresh results
    try {
      console.log('Forcing WiFi rescan...');
      await execPromise('sudo nmcli device wifi rescan');
      // Wait a moment for the scan to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (rescanError) {
      console.warn('Rescan failed, continuing with available data:', rescanError.message);
    }
    
    // Linux implementation using nmcli (primary method)
    try {
      console.log('Attempting to scan with nmcli...');
      command = 'nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE device wifi list';
      const { stdout } = await execPromise(command);
      console.log('Network scan output received, length:', stdout.length);
      
      // Parse nmcli output
      const lines = stdout.split('\n').filter(Boolean);
      console.log(`Found ${lines.length} networks in scan results`);
      
      for (const line of lines) {
        const [ssid, signalStr, security, inUse] = line.split(':');
        
        if (ssid) {
          console.log(`Processing network: ${ssid}`);
          
          networks.push({
            ssid,
            signalStrength: -(100 - parseInt(signalStr || '0')), // Convert to negative dBm
            security: security || 'Unknown',
            connected: inUse === '*'
          });
        }
      }
    } catch (nmcliError) {
      console.error('nmcli failed, trying iwlist:', nmcliError);
      
      // Try with sudo for better results (standard on Raspberry Pi)
      try {
        command = "sudo iwlist wlan0 scan | grep -E 'ESSID|Quality|Encryption key'";
        console.log('Attempting with sudo and iwlist...');
        const { stdout } = await execPromise(command);
        
        // Parse iwlist output
        const lines = stdout.split('\n').filter(Boolean);
        let currentNetwork = {};
        
        for (const line of lines) {
          if (line.includes('ESSID')) {
            if (currentNetwork.ssid) {
              networks.push(currentNetwork);
              currentNetwork = {};
            }
            const ssidMatch = line.match(/ESSID:"(.*)"/);
            if (ssidMatch) {
              currentNetwork.ssid = ssidMatch[1];
            }
          } else if (line.includes('Quality')) {
            const qualityMatch = line.match(/Quality=(\d+)\/(\d+)/);
            if (qualityMatch) {
              const quality = parseInt(qualityMatch[1]) / parseInt(qualityMatch[2]);
              currentNetwork.signalStrength = Math.round(-100 + (quality * 50)); // Convert to dBm
            }
          } else if (line.includes('Encryption key')) {
            const encryptionMatch = line.match(/Encryption key:(on|off)/);
            if (encryptionMatch) {
              currentNetwork.security = encryptionMatch[1] === 'on' ? 'WPA/WPA2' : 'Open';
            }
          }
        }
        
        // Add the last network if it exists
        if (currentNetwork.ssid) {
          networks.push(currentNetwork);
        }
      } catch (sudoError) {
        console.error('sudo iwlist failed, trying regular iwlist:', sudoError);
        
        // If sudo fails, try regular iwlist
        try {
          command = "iwlist wlan0 scan | grep -E 'ESSID|Quality|Encryption key'";
          const { stdout } = await execPromise(command);
          
          // Parse the output (similar to above)
          const lines = stdout.split('\n').filter(Boolean);
          let currentNetwork = {};
          
          for (const line of lines) {
            if (line.includes('ESSID')) {
              if (currentNetwork.ssid) {
                networks.push(currentNetwork);
                currentNetwork = {};
              }
              const ssidMatch = line.match(/ESSID:"(.*)"/);
              if (ssidMatch) {
                currentNetwork.ssid = ssidMatch[1];
              }
            } else if (line.includes('Quality')) {
              const qualityMatch = line.match(/Quality=(\d+)\/(\d+)/);
              if (qualityMatch) {
                const quality = parseInt(qualityMatch[1]) / parseInt(qualityMatch[2]);
                currentNetwork.signalStrength = Math.round(-100 + (quality * 50)); // Convert to dBm
              }
            } else if (line.includes('Encryption key')) {
              const encryptionMatch = line.match(/Encryption key:(on|off)/);
              if (encryptionMatch) {
                currentNetwork.security = encryptionMatch[1] === 'on' ? 'WPA/WPA2' : 'Open';
              }
            }
          }
          
          // Add the last network if it exists
          if (currentNetwork.ssid) {
            networks.push(currentNetwork);
          }
        } catch (regularIwlistError) {
          console.error('Regular iwlist failed:', regularIwlistError);
        }
        
        // Try wpa_cli as a last resort (should work on almost any Raspberry Pi)
        try {
          command = "sudo wpa_cli scan && sleep 2 && sudo wpa_cli scan_results";
          const { stdout } = await execPromise(command);
          
          // Parse wpa_cli output
          const lines = stdout.split('\n').filter(line => /([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}/.test(line));
          
          for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 5) {
              const bssid = parts[0];
              const signalStrength = parseInt(parts[3]);
              const ssid = parts[4];
              
              if (ssid && ssid !== '') {
                networks.push({
                  ssid,
                  signalStrength,
                  security: 'Unknown', // wpa_cli doesn't easily show security
                  connected: false // Determining connected state requires additional commands
                });
              }
            }
          }
        } catch (wpaCliError) {
          console.error('wpa_cli failed:', wpaCliError);
        }
      }
    }
    
    // Print scan results for debugging
    console.log(`Total networks found: ${networks.length}`);
    
    // Remove duplicate networks (sometimes we get duplicates from different scanning methods)
    networks = networks.filter((network, index, self) => 
      index === self.findIndex((n) => n.ssid === network.ssid)
    );
    
    console.log(`Networks after removing duplicates: ${networks.length}`);
    
    // If no networks found or execution failed, provide fallback message
    if (networks.length === 0) {
      console.warn('Failed to scan for networks using system commands.');
      networks = [
        { 
          ssid: "No WiFi networks found", 
          signalStrength: 0, 
          security: "N/A", 
          connected: false,
          error: "Make sure WiFi is enabled on your Raspberry Pi"
        }
      ];
    }
    
    // Sort networks by signal strength
    networks.sort((a, b) => b.signalStrength - a.signalStrength);
    
    // Update the cache with new results
    cachedNetworks = networks;
    lastScanTime = now;
    
    return networks;
  } catch (error) {
    console.error('Error scanning for WiFi networks:', error);
    // Return error message
    return [
      { 
        ssid: "Error scanning for networks", 
        signalStrength: 0, 
        security: "N/A", 
        connected: false,
        error: error.message 
      }
    ];
  }
}

// GET handler for WiFi scanning
export async function GET(request) {
  try {
    // Check for force scan query parameter
    const url = new URL(request.url);
    const forceScan = url.searchParams.get('force') === 'true';
    
    // First attempt
    let networks = await scanWifiNetworks(forceScan);
    
    // If no networks found, try again after a short delay
    if (networks.length === 1 && networks[0].error && !cachedNetworks) {
      console.log("No networks found in first attempt, trying again after delay...");
      
      // Wait for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try again with force scan
      networks = await scanWifiNetworks(true);
    }
    
    return NextResponse.json(networks);
  } catch (error) {
    console.error('Error scanning for WiFi networks:', error);
    return NextResponse.json(
      { error: 'Failed to scan for WiFi networks: ' + error.message },
      { status: 500 }
    );
  }
}

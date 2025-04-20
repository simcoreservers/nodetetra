// API route for checking network connection status
// Implementation for Raspberry Pi / Linux systems

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Function to get network connection status on Raspberry Pi / Linux
export async function GET() {
  try {
    console.log('Checking network status on Raspberry Pi / Linux');
    
    // First check if we're connected to WiFi
    let wifiStatus = {
      connected: false,
      ssid: null,
      ipAddress: null,
      signalStrength: null,
      networkType: 'Not Connected'
    };
    
    // Primary check using nmcli (standard on Raspberry Pi OS)
    try {
      console.log('Checking WiFi status using nmcli...');
      const { stdout: nmcliOutput } = await execPromise('nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active');
      
      // Parse the output to find active WiFi connections
      const connections = nmcliOutput.split('\n').filter(Boolean);
      console.log(`Found ${connections.length} active connections`);
      
      // Look for WiFi connections that are active
      const wifiLine = connections.find(line => line.includes(':wifi:') && line.includes(':activated'));
      
      if (wifiLine) {
        // Extract SSID
        const ssid = wifiLine.split(':')[0];
        console.log(`Found active WiFi connection: ${ssid}`);
        
        wifiStatus.connected = true;
        wifiStatus.ssid = ssid;
        wifiStatus.networkType = 'WiFi';
        
        // Get IP address using ip addr show
        try {
          const { stdout: ipInfo } = await execPromise('ip addr show $(ip route | grep default | awk \'{print $5}\') | grep "inet " | awk \'{print $2}\'');
          if (ipInfo) {
            wifiStatus.ipAddress = ipInfo.trim().split('/')[0];
            console.log(`IP address: ${wifiStatus.ipAddress}`);
          }
        } catch (ipError) {
          console.error('Error getting IP address:', ipError);
        }
        
        // Get signal strength
        try {
          const { stdout: signalInfo } = await execPromise(`nmcli -f SIGNAL,ACTIVE device wifi list | grep '*' | awk '{print $1}'`);
          if (signalInfo) {
            const signalPercent = parseInt(signalInfo.trim());
            // Convert percentage to dBm (approximation)
            wifiStatus.signalStrength = -(100 - signalPercent);
            console.log(`Signal strength: ${wifiStatus.signalStrength} dBm`);
          }
        } catch (signalError) {
          console.error('Error getting signal strength:', signalError);
        }
      } else {
        console.log('No active WiFi connections found with nmcli');
      }
    } catch (nmcliError) {
      console.error('Error using nmcli:', nmcliError);
      
      // Fallback to iwconfig which is available on most Linux distributions
      try {
        console.log('Trying iwconfig as fallback...');
        const { stdout: iwconfigOutput } = await execPromise('iwconfig 2>/dev/null | grep -v "no wireless"');
        
        // Parse iwconfig output
        if (iwconfigOutput.includes('ESSID:') && !iwconfigOutput.includes('ESSID:off/any')) {
          const ssidMatch = iwconfigOutput.match(/ESSID:"([^"]+)"/);
          if (ssidMatch) {
            wifiStatus.connected = true;
            wifiStatus.ssid = ssidMatch[1];
            wifiStatus.networkType = 'WiFi';
            console.log(`Found active WiFi connection via iwconfig: ${wifiStatus.ssid}`);
            
            // Extract signal strength if available
            const qualityMatch = iwconfigOutput.match(/Signal level=(-\d+) dBm/);
            if (qualityMatch) {
              wifiStatus.signalStrength = parseInt(qualityMatch[1]);
              console.log(`Signal strength: ${wifiStatus.signalStrength} dBm`);
            }
            
            // Get IP address
            try {
              const { stdout: ipInfo } = await execPromise('hostname -I | awk \'{print $1}\'');
              if (ipInfo) {
                wifiStatus.ipAddress = ipInfo.trim();
                console.log(`IP address: ${wifiStatus.ipAddress}`);
              }
            } catch (ipError) {
              console.error('Error getting IP address:', ipError);
            }
          }
        }
      } catch (iwconfigError) {
        console.error('Error using iwconfig:', iwconfigError);
      }
    }
    
    // Check internet connectivity (ping test)
    let internetStatus = {
      connected: false,
      latency: null
    };
    
    try {
      console.log('Testing internet connectivity...');
      const pingCommand = 'ping -c 3 -w 5 8.8.8.8 | grep "time=" | awk \'{print $7}\' | cut -d "=" -f 2';
      const { stdout: pingOutput } = await execPromise(pingCommand);
      
      if (pingOutput) {
        const pingTimes = pingOutput.split('\n').filter(Boolean).map(parseFloat);
        if (pingTimes.length > 0) {
          internetStatus.connected = true;
          // Calculate average latency
          internetStatus.latency = Math.round(pingTimes.reduce((sum, time) => sum + time, 0) / pingTimes.length);
          console.log(`Internet connected with latency: ${internetStatus.latency}ms`);
        }
      }
    } catch (pingError) {
      console.log('Internet connectivity test failed:', pingError.message);
      internetStatus.connected = false;
    }
    
    // Get system info (for debugging)
    let systemInfo = {};
    
    try {
      // Get hostname
      const { stdout: hostname } = await execPromise('hostname');
      systemInfo.hostname = hostname.trim();
      
      // Get uptime
      const { stdout: uptime } = await execPromise('uptime -p');
      systemInfo.uptime = uptime.trim();
      
      // Check for Raspberry Pi specific information
      try {
        const { stdout: vcgencmdOutput } = await execPromise('vcgencmd measure_temp');
        if (vcgencmdOutput) {
          const tempMatch = vcgencmdOutput.match(/temp=([0-9.]+)/);
          if (tempMatch) {
            systemInfo.cpuTemperature = tempMatch[1];
          }
        }
      } catch (vcgencmdError) {
        console.log('Not a Raspberry Pi or vcgencmd not available');
      }
    } catch (sysInfoError) {
      console.error('Error getting system info:', sysInfoError);
    }
    
    // Return all collected information
    return NextResponse.json({
      wifi: wifiStatus,
      internet: internetStatus,
      system: systemInfo
    });
    
  } catch (error) {
    console.error('Error checking network status:', error);
    return NextResponse.json(
      { error: 'Failed to check network status: ' + error.message },
      { status: 500 }
    );
  }
}

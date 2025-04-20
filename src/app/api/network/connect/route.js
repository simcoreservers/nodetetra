// API route for connecting to WiFi networks
// Implementation for Raspberry Pi / Linux systems

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = promisify(exec);

export async function POST(request) {
  try {
    const data = await request.json();
    const { ssid, password } = data;
    
    if (!ssid) {
      return NextResponse.json(
        { error: 'SSID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Attempting to connect to WiFi network: ${ssid}`);
    
    // Connect to WiFi using appropriate Linux methods
    const result = await connectToWiFiLinux(ssid, password);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error connecting to WiFi:', error);
    return NextResponse.json(
      { error: `Failed to connect to WiFi: ${error.message}` },
      { status: 500 }
    );
  }
}

async function connectToWiFiLinux(ssid, password) {
  try {
    console.log(`Connecting to WiFi on Linux/Raspberry Pi: ${ssid}`);
    
    // Try first with nmcli (NetworkManager) which is commonly used on modern Linux distributions
    try {
      console.log('Attempting to connect using NetworkManager (nmcli)...');
      
      // Check if connection profile already exists
      const { stdout: nmcliConnList } = await execPromise(`nmcli -t connection show | grep "${ssid}"`);
      
      if (nmcliConnList && nmcliConnList.includes(ssid)) {
        // Connection exists, modify it
        console.log(`Connection profile for ${ssid} exists, updating password`);
        if (password) {
          await execPromise(`nmcli connection modify "${ssid}" wifi-sec.psk "${password}"`);
        }
        
        // Activate the connection
        const { stdout: activateOutput } = await execPromise(`nmcli connection up "${ssid}"`);
        console.log(`Connection activation result: ${activateOutput}`);
      } else {
        // Create new connection
        console.log(`Creating new connection for ${ssid}`);
        let connectCmd = `nmcli device wifi connect "${ssid}"`;
        if (password) {
          connectCmd += ` password "${password}"`;
        }
        
        const { stdout: connectOutput } = await execPromise(connectCmd);
        console.log(`Connection result: ${connectOutput}`);
      }
      
      // Verify connection
      const { stdout: verifyOutput } = await execPromise('nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active');
      if (verifyOutput.includes(ssid) && verifyOutput.includes('activated')) {
        return {
          success: true,
          message: `Successfully connected to ${ssid}`,
          method: 'nmcli'
        };
      } else {
        throw new Error('Connection verification failed');
      }
    } catch (nmcliError) {
      console.error('Error connecting with nmcli:', nmcliError);
      
      // Fall back to wpa_cli if nmcli fails
      try {
        console.log('Attempting to connect using wpa_supplicant (wpa_cli)...');
        
        // Make sure wpa_supplicant is running
        await execPromise('pidof wpa_supplicant || sudo systemctl restart wpa_supplicant');
        
        // Find the WiFi interface
        const { stdout: iwOutput } = await execPromise('iw dev | grep Interface | cut -d " " -f 2');
        const wifiInterface = iwOutput.trim() || 'wlan0'; // Default to wlan0 if not found
        
        console.log(`Using WiFi interface: ${wifiInterface}`);
        
        // Configure wpa_supplicant
        const wpaConfigPath = '/etc/wpa_supplicant/wpa_supplicant.conf';
        
        // Check if the file exists and is writable
        let canWriteToSystemConfig = false;
        try {
          await fs.access(wpaConfigPath, fs.constants.W_OK);
          canWriteToSystemConfig = true;
        } catch (accessError) {
          canWriteToSystemConfig = false;
        }
        
        if (!canWriteToSystemConfig) {
          // If not writable, we'll need to create a temporary config
          console.log('Cannot write to system wpa_supplicant.conf, creating temporary config');
          const tmpConfigPath = path.join('/tmp', 'wpa_supplicant.conf');
          
          // Create basic config structure
          let wpaConfig = 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\ncountry=US\n\n';
          
          // Add network configuration
          wpaConfig += 'network={\n';
          wpaConfig += `  ssid="${ssid}"\n`;
          if (password) {
            wpaConfig += `  psk="${password}"\n`;
          } else {
            wpaConfig += '  key_mgmt=NONE\n';
          }
          wpaConfig += '  priority=1\n';
          wpaConfig += '}\n';
          
          await fs.writeFile(tmpConfigPath, wpaConfig);
          
          // Apply configuration using temporary file
          await execPromise(`sudo wpa_supplicant -B -i ${wifiInterface} -c ${tmpConfigPath}`);
          
          // Request DHCP address
          await execPromise(`sudo dhclient ${wifiInterface}`);
          
          // Remove temporary file
          await fs.unlink(tmpConfigPath);
        } else {
          // We can update the system config
          // First remove any existing configurations for this SSID to avoid duplicates
          await execPromise(`sudo wpa_cli -i ${wifiInterface} remove_network all`);
          
          // Add the new network
          const { stdout: networkIdOutput } = await execPromise(`sudo wpa_cli -i ${wifiInterface} add_network`);
          const networkId = networkIdOutput.trim();
          
          await execPromise(`sudo wpa_cli -i ${wifiInterface} set_network ${networkId} ssid '"${ssid}"'`);
          
          if (password) {
            await execPromise(`sudo wpa_cli -i ${wifiInterface} set_network ${networkId} psk '"${password}"'`);
          } else {
            await execPromise(`sudo wpa_cli -i ${wifiInterface} set_network ${networkId} key_mgmt NONE`);
          }
          
          await execPromise(`sudo wpa_cli -i ${wifiInterface} enable_network ${networkId}`);
          await execPromise(`sudo wpa_cli -i ${wifiInterface} select_network ${networkId}`);
          await execPromise(`sudo wpa_cli -i ${wifiInterface} save_config`);
          
          // Restart the interface to apply changes
          await execPromise(`sudo ip link set ${wifiInterface} down`);
          await execPromise(`sudo ip link set ${wifiInterface} up`);
          
          // Request DHCP address
          await execPromise(`sudo dhclient ${wifiInterface}`);
        }
        
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verify connection
        const { stdout: iwconfigOutput } = await execPromise(`iwconfig ${wifiInterface}`);
        if (iwconfigOutput.includes(`ESSID:"${ssid}"`) && !iwconfigOutput.includes('Not-Associated')) {
          return {
            success: true,
            message: `Successfully connected to ${ssid} using wpa_supplicant`,
            method: 'wpa_supplicant'
          };
        } else {
          throw new Error('wpa_supplicant connection verification failed');
        }
      } catch (wpaError) {
        console.error('Error connecting with wpa_supplicant:', wpaError);
        
        // Last resort: Direct /etc/network/interfaces update (Debian/Raspbian approach)
        try {
          console.log('Attempting connection via /etc/network/interfaces...');
          
          // Path to interfaces file
          const interfacesPath = '/etc/network/interfaces';
          
          // Read current interfaces config
          const interfacesConfig = await fs.readFile(interfacesPath, 'utf8');
          
          // Create backup
          await fs.writeFile(`${interfacesPath}.bak`, interfacesConfig);
          
          // Find the wlan0 section or create it
          let newConfig = interfacesConfig;
          const wlanSection = interfacesConfig.match(/iface wlan0 inet dhcp[\s\S]*?(?=\n\n|\n$|$)/);
          
          // Create updated or new wlan0 section
          const newWlanConfig = `iface wlan0 inet dhcp
  wpa-ssid "${ssid}"
  ${password ? `wpa-psk "${password}"` : 'wpa-key-mgmt NONE'}`;
          
          if (wlanSection) {
            // Replace existing section
            newConfig = interfacesConfig.replace(/iface wlan0 inet dhcp[\s\S]*?(?=\n\n|\n$|$)/, newWlanConfig);
          } else {
            // Add new section
            newConfig = `${interfacesConfig}\n\n${newWlanConfig}\n`;
          }
          
          // Write new config
          await fs.writeFile(interfacesPath, newConfig);
          
          // Apply changes
          await execPromise('sudo systemctl restart networking');
          
          // Wait for connection
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Verify connection
          const { stdout: ifconfigOutput } = await execPromise('ifconfig wlan0');
          if (ifconfigOutput.includes('inet') && !ifconfigOutput.includes('inet 0.0.0.0')) {
            return {
              success: true,
              message: `Successfully connected to ${ssid} using /etc/network/interfaces`,
              method: 'interfaces'
            };
          } else {
            throw new Error('interfaces connection verification failed');
          }
        } catch (interfacesError) {
          console.error('Error connecting via interfaces file:', interfacesError);
          throw new Error('All connection methods failed');
        }
      }
    }
  } catch (error) {
    console.error('Error in connectToWiFiLinux:', error);
    return {
      success: false,
      message: `Failed to connect to WiFi: ${error.message}`,
      error: error.message
    };
  }
}

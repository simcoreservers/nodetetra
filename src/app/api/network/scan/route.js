// API route for scanning WiFi networks
// In a real production application, this would interact with the system's WiFi hardware

import { NextResponse } from 'next/server';

// GET handler for WiFi scanning
export async function GET() {
  try {
    // In a production environment, this would use OS-specific commands or libraries
    // to scan for available WiFi networks
    
    // For example, on Linux you might use:
    // - iwlist scanning
    // - nmcli device wifi list
    
    // For demonstration, we'll return simulated WiFi networks
    const networks = [
      { ssid: "Greenhouse_Network", signalStrength: -45, security: "WPA2", connected: true },
      { ssid: "Home_WiFi", signalStrength: -60, security: "WPA2", connected: false },
      { ssid: "Office_Network", signalStrength: -70, security: "WPA2", connected: false },
      { ssid: "Guest_Network", signalStrength: -55, security: "Open", connected: false },
      { ssid: "IoT_Network", signalStrength: -65, security: "WPA2", connected: false }
    ];
    
    return NextResponse.json(networks);
  } catch (error) {
    console.error('Error scanning for WiFi networks:', error);
    return NextResponse.json(
      { error: 'Failed to scan for WiFi networks' },
      { status: 500 }
    );
  }
}

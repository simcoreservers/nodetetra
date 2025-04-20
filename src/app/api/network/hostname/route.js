// API route for updating hostname
// In a real production application, this would interact with the system's hostname configuration

import { NextResponse } from 'next/server';

// Reference to the network status in the status endpoint (for demo purposes)
// In a real app, this would interact with the OS
let networkStatus = {
  hostname: "nutetra-system",
  ipAddress: "192.168.1.105",
  macAddress: "A1:B2:C3:D4:E5:F6",
  connectionType: "WiFi",
  ssid: "Greenhouse_Network",
  signalStrength: "Excellent",
  connected: true,
  lastUpdated: new Date().toISOString()
};

// PUT handler for updating hostname
export async function PUT(req) {
  try {
    // Parse the request body
    const body = await req.json();
    const { hostname } = body;
    
    // Input validation
    if (!hostname) {
      return NextResponse.json(
        { error: 'Hostname is required' },
        { status: 400 }
      );
    }
    
    // Validate hostname format (basic validation)
    if (!/^[a-zA-Z0-9-]+$/.test(hostname)) {
      return NextResponse.json(
        { error: 'Invalid hostname format. Use only letters, numbers, and hyphens.' },
        { status: 400 }
      );
    }
    
    // In a production environment, this would use OS-specific commands or libraries
    // to update the system's hostname
    
    // For example, on Linux you might use:
    // - hostnamectl set-hostname [HOSTNAME]
    // - Update /etc/hostname file
    
    // For demonstration, we'll update our simulated network status
    networkStatus.hostname = hostname;
    networkStatus.lastUpdated = new Date().toISOString();
    
    return NextResponse.json({
      success: true,
      message: `Hostname updated to ${hostname}`,
      hostname
    });
  } catch (error) {
    console.error('Error updating hostname:', error);
    return NextResponse.json(
      { error: 'Failed to update hostname' },
      { status: 500 }
    );
  }
}

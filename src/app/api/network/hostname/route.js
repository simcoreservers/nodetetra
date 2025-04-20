// API route for updating hostname
// Implementation uses system commands to update the actual system hostname

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';

const execPromise = promisify(exec);

// Function to update system hostname
async function updateSystemHostname(hostname) {
  try {
    // Linux implementation
    // Try hostnamectl first (modern systems)
    try {
      await execPromise(`hostnamectl set-hostname ${hostname}`);
    } catch (error) {
      // Fallback methods for different Linux distributions
      console.log('hostnamectl failed, trying alternative methods');
      
      // Update /etc/hostname file
      await fs.writeFile('/etc/hostname', hostname);
      
      // Update current hostname
      await execPromise(`hostname ${hostname}`);
      
      // Update /etc/hosts file to include the new hostname
      try {
        const hostsContent = await fs.readFile('/etc/hosts', 'utf8');
        const localIpRegex = new RegExp(`(127\\.0\\.0\\.1[\\s\\t]+)${os.hostname()}`, 'g');
        
        if (localIpRegex.test(hostsContent)) {
          const updatedHosts = hostsContent.replace(
            localIpRegex, 
            `$1${hostname}`
          );
          await fs.writeFile('/etc/hosts', updatedHosts);
        }
      } catch (hostsError) {
        console.error('Error updating /etc/hosts:', hostsError);
        // Continue even if this fails
      }
    }
    
    return {
      success: true,
      message: `Hostname updated to ${hostname}`,
      hostname,
      rebootRequired: false
    };
  } catch (error) {
    console.error(`Error updating hostname:`, error);
    throw error;
  }
}

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
    
    // Additional validation
    if (hostname.length > 63) {
      return NextResponse.json(
        { error: 'Hostname must be 63 characters or less' },
        { status: 400 }
      );
    }
    
    if (hostname.startsWith('-') || hostname.endsWith('-')) {
      return NextResponse.json(
        { error: 'Hostname cannot start or end with a hyphen' },
        { status: 400 }
      );
    }
    
    // Update the system hostname
    const result = await updateSystemHostname(hostname);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating hostname:', error);
    return NextResponse.json(
      { error: `Failed to update hostname: ${error.message}` },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';

// Initialize systems on server startup
let initialized = false;

const initSystems = async () => {
  if (initialized) return;
  
  try {
    const { initializeAlertSystem } = await import('../../lib/alerts');
    
    // Initialize all systems
    await initializeAlertSystem();
    
    console.log('All systems initialized successfully');
    initialized = true;
    return true;
  } catch (error) {
    console.error('Error initializing systems:', error);
    return false;
  }
};

// Initialize on first API route load
initSystems();

export async function GET() {
  const success = await initSystems();
  return NextResponse.json({ initialized: success });
} 
import { NextResponse } from 'next/server';
import { disableMonitoring } from '@/app/lib/monitorControl';

const MODULE = 'api:dosing:force-stop';

/**
 * POST handler for force stopping auto-dosing monitoring
 */
export async function POST() {
  try {
    // Force monitoring off
    disableMonitoring();
    console.log('Force-stop API: Disabled monitoring flag');
    
    // Use dynamic import to avoid server-only code being included in client bundles
    if (typeof window === 'undefined') {
      // First update the auto-dosing config to disabled
      const autoDosingLib = await import('../../../lib/autoDosing');
      
      // Force disable auto-dosing regardless of current state
      autoDosingLib.updateDosingConfig({ enabled: false });
      console.log('Force-stop API: Set auto-dosing enabled=false in config');
      
      // Then stop continuous monitoring
      const { stopContinuousMonitoring } = await import('../../../lib/server-init');
      
      // Call stop twice to ensure it's really stopped (paranoid, but safe)
      stopContinuousMonitoring();
      setTimeout(() => {
        // Double-check after a short delay
        stopContinuousMonitoring();
        console.log('Force-stop API: Secondary verification of monitoring stop');
      }, 500);
      
      console.log('FORCE STOPPED AUTO-DOSING MONITORING VIA DIRECT API CALL');
      
      // Now force stop any active pumps
      const { getAllPumpStatus, stopPump } = await import('../../../lib/pumps');
      const pumps = getAllPumpStatus();
      const activePumps = pumps.filter(p => p.active);
      
      console.log(`Checking for active pumps to force stop: ${activePumps.length} active`);
      
      // Stop all active pumps in parallel
      await Promise.all(activePumps.map(pump => {
        console.log(`Force stopping active pump ${pump.name} after auto-dosing disable`);
        return stopPump(pump.name).catch(err => 
          console.error(`Error stopping pump ${pump.name}:`, err));
      }));
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Forced monitoring to stop and cleaned up all active pumps'
    });
  } catch (err) {
    console.error('Error in force-stop API:', err);
    
    // Still try to disable monitoring even if other parts failed
    try {
      disableMonitoring();
      if (typeof window === 'undefined') {
        const { stopContinuousMonitoring } = await import('../../../lib/server-init');
        stopContinuousMonitoring();
      }
    } catch (secondaryErr) {
      console.error('Error during emergency shutdown attempt:', secondaryErr);
    }
    
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to force stop monitoring',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
} 
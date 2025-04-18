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
    
    // Use dynamic import to avoid server-only code being included in client bundles
    if (typeof window === 'undefined') {
      // First stop continuous monitoring
      const { stopContinuousMonitoring } = await import('../../../lib/server-init');
      stopContinuousMonitoring();
      console.log('FORCE STOPPED AUTO-DOSING MONITORING VIA DIRECT API CALL');
      
      // Then set the explicit disable flag in autoDosing
      const autoDosingLib = await import('../../../lib/autoDosing');
      
      // Update config to disabled state if it's not already
      if (autoDosingLib.getDosingConfig().enabled) {
        autoDosingLib.updateDosingConfig({ enabled: false });
      }
      
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
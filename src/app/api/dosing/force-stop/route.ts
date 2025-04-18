import { NextResponse } from 'next/server';
import { disableMonitoring } from '@/app/lib/monitorControl';
import { info } from '@/app/lib/logger';

const MODULE = 'api:dosing:force-stop';

/**
 * POST handler for forcibly stopping auto-dosing monitoring
 * This is a safety endpoint used when the UI needs to ensure monitoring is stopped
 */
export async function POST() {
  try {
    // Safety check - server side only
    if (typeof window !== 'undefined') {
      return NextResponse.json(
        { status: 'error', error: 'Server side operation only' },
        { status: 400 }
      );
    }

    // Force disable monitoring
    disableMonitoring();
    info(MODULE, 'Force stopped auto-dosing monitoring via API request');
    
    // Also try to stop continuous monitoring if possible
    try {
      const { stopContinuousMonitoring } = await import('@/app/lib/server-init');
      stopContinuousMonitoring();
      info(MODULE, 'Successfully stopped continuous monitoring process');
    } catch (err) {
      console.error('[ERROR] Failed to stop continuous monitoring:', err);
    }
    
    // Update auto-dosing config to disabled
    try {
      const { updateDosingConfig } = await import('@/app/lib/autoDosing');
      updateDosingConfig({ enabled: false });
      info(MODULE, 'Set auto-dosing configuration to disabled');
    } catch (err) {
      console.error('[ERROR] Failed to update auto-dosing config:', err);
    }

    return NextResponse.json({
      status: 'success',
      message: 'Auto-dosing monitoring forcibly disabled'
    });
  } catch (err) {
    console.error('[ERROR] [dosing-force-stop]', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to force-stop monitoring',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
} 
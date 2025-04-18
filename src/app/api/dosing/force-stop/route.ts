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
      const { stopContinuousMonitoring } = await import('../../../lib/server-init');
      stopContinuousMonitoring();
      console.log('FORCE STOPPED AUTO-DOSING MONITORING VIA DIRECT API CALL');
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Forced monitoring to stop'
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
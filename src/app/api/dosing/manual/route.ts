import { NextRequest, NextResponse } from 'next/server';
import { dispensePump, getAllPumpStatus, PumpName } from '@/app/lib/pumps';
import { error, info, debug, warn } from '@/app/lib/logger';

const MODULE = 'api:dosing:manual';

// Manual dosing lock to prevent concurrent pump operations
const dosingLock = {
  inProgress: false,
  lastAttempt: 0,
  timeout: null as NodeJS.Timeout | null
};
const MAX_DOSING_LOCK_TIME = 30000; // 30 seconds max lock time
const MIN_DOSING_ATTEMPT_INTERVAL = 500; // 0.5s minimum between attempts

/**
 * POST handler - manual pump dispensing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pumpName, amount, flowRate } = body;
    
    // Validate inputs
    if (!pumpName) {
      return NextResponse.json(
        { status: 'error', error: 'Missing pumpName parameter' },
        { status: 400 }
      );
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { status: 'error', error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now - dosingLock.lastAttempt < MIN_DOSING_ATTEMPT_INTERVAL) {
      warn(MODULE, `Dosing attempted too frequently (${now - dosingLock.lastAttempt}ms since last attempt)`);
      return NextResponse.json({
        status: 'error',
        error: 'Dosing attempted too frequently, please wait'
      }, { status: 429 }); // Too Many Requests
    }
    dosingLock.lastAttempt = now;
    
    // Check if already in progress
    if (dosingLock.inProgress) {
      warn(MODULE, 'Dosing already in progress');
      return NextResponse.json({
        status: 'error',
        error: 'A dosing operation is already in progress'
      }, { status: 429 }); // Too Many Requests
    }
    
    // Check for already active pumps
    try {
      const pumpStatus = getAllPumpStatus();
      const activePumps = pumpStatus.filter(pump => pump.active).map(pump => pump.name);
      
      if (activePumps.length > 0) {
        warn(MODULE, `Active pumps detected: ${activePumps.join(', ')}`);
        return NextResponse.json({
          status: 'error',
          error: `Cannot dispense - active pumps detected: ${activePumps.join(', ')}`
        }, { status: 409 }); // Conflict
      }
    } catch (err) {
      error(MODULE, 'Error checking pump status', err);
      return NextResponse.json({
        status: 'error',
        error: 'Failed to check pump status'
      }, { status: 500 });
    }
    
    try {
      // Acquire dosing lock
      dosingLock.inProgress = true;
      
      // Set safety timeout to release lock in case of unhandled errors
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
      }
      dosingLock.timeout = setTimeout(() => {
        warn(MODULE, 'Safety timeout reached, releasing dosing lock');
        dosingLock.inProgress = false;
        dosingLock.timeout = null;
      }, MAX_DOSING_LOCK_TIME);
      
      // Calculate effective flow rate
      const effectiveFlowRate = typeof flowRate === 'number' && flowRate > 0 ? 
        flowRate : 1.0;
      
      info(MODULE, `Manually dispensing ${amount}ml from ${pumpName} at ${effectiveFlowRate}ml/s`);
      
      // Actually dispense
      await dispensePump(pumpName as PumpName, amount, effectiveFlowRate);
      
      return NextResponse.json({
        status: 'success',
        result: {
          action: 'dispensed',
          details: {
            pumpName,
            amount,
            flowRate: effectiveFlowRate,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (err) {
      error(MODULE, `Error dispensing from ${pumpName}`, err);
      return NextResponse.json({
        status: 'error',
        error: `Failed to dispense from ${pumpName}: ${err}`
      }, { status: 500 });
    } finally {
      // Always release the lock when we're done
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
      dosingLock.inProgress = false;
      debug(MODULE, 'Manual dosing completed, lock released');
    }
  } catch (err) {
    error(MODULE, 'Unexpected error in manual dosing API:', err);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to process manual dosing request'
    }, { status: 500 });
  }
}

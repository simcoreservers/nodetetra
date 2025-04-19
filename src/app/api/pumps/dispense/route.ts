import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  dispensePump,
  loadPumpConfig,
  PumpName,
  getAllPumpStatus,
  getRecentEvents
} from '../../../lib/pumps';
import { error, debug, info, warn } from '@/app/lib/logger';

const MODULE = 'api:pumps:dispense';
const execAsync = promisify(exec);

// Check if WiringPi/GPIO utility is installed
async function checkGpioUtility() {
  try {
    const { stdout } = await execAsync('gpio -v');
    debug(MODULE, 'GPIO utility version:', stdout.split('\n')[0]);
    return true;
  } catch (err) {
    warn(MODULE, 'GPIO utility not available:', err);
    return false;
  }
}

/**
 * POST endpoint specifically for dispensing from pumps
 * This endpoint is designed to be used by the auto-dosing system
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure configuration is loaded before dispensing
    loadPumpConfig();
    
    const data = await request.json();
    const { pump, amount, flowRate } = data;
    
    // Log request details
    info(MODULE, `Dispense request: pump=${pump}, amount=${amount}, flowRate=${flowRate}`);
    
    // Validate parameters
    if (!pump || amount === undefined || amount === null || flowRate === undefined || flowRate === null) {
      error(MODULE, 'Missing required parameters', { pump, amount, flowRate });
      return NextResponse.json(
        { status: 'error', error: 'Missing required parameters (pump, amount, flowRate)' },
        { status: 400 }
      );
    }
    
    // Validate pump name
    if (!['pH Up', 'pH Down', 'Pump 1', 'Pump 2', 'Pump 3', 'Pump 4'].includes(pump)) {
      error(MODULE, 'Invalid pump name', { pump });
      return NextResponse.json(
        { status: 'error', error: 'Invalid pump name' },
        { status: 400 }
      );
    }
    
    // Validate amount and flowRate are positive numbers
    if (typeof amount !== 'number' || amount <= 0 || typeof flowRate !== 'number' || flowRate <= 0) {
      error(MODULE, 'Invalid amount or flowRate values', { amount, flowRate });
      return NextResponse.json(
        { status: 'error', error: 'Amount and flowRate must be positive numbers' },
        { status: 400 }
      );
    }
    
    // Dispense from the pump
    try {
      info(MODULE, `Dispensing ${amount}ml from ${pump} at ${flowRate}ml/s`);
      await dispensePump(pump as PumpName, amount, flowRate);
      
      // Return success response with updated status
      const pumpStatus = getAllPumpStatus();
      const recentEvents = getRecentEvents(5);
      
      return NextResponse.json({
        status: 'success',
        message: `Successfully dispensed ${amount}ml from ${pump}`,
        pumpStatus,
        recentEvents,
        timestamp: new Date().toISOString()
      });
    } catch (dispenseError) {
      error(MODULE, 'Error dispensing from pump', dispenseError);
      return NextResponse.json(
        { 
          status: 'error', 
          error: 'Failed to dispense from pump', 
          details: dispenseError instanceof Error ? dispenseError.message : String(dispenseError) 
        },
        { status: 500 }
      );
    }
  } catch (err) {
    error(MODULE, 'Error processing dispense request', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process dispense request', 
        details: err instanceof Error ? err.message : String(err) 
      },
      { status: 500 }
    );
  }
}

// Also support GET method for testing purposes
export async function GET() {
  return NextResponse.json({
    status: 'success',
    message: 'Dispense endpoint is available',
    usage: 'Send a POST request with { "pump": "Pump 1", "amount": 5, "flowRate": 1 }'
  });
}

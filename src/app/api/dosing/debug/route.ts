import { NextResponse } from 'next/server';
import { getDosingConfig } from '@/app/lib/autoDosing';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { isSimulationEnabled, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllPumpStatus, PumpStatus } from '@/app/lib/pumps';
import { isMonitoringEnabled } from '@/app/lib/monitorControl';

const MODULE = 'api:dosing:debug';

interface ValueStatus {
  value: number;
  target: number;
  tolerance: number;
  min: number;
  max: number;
  status: 'LOW' | 'OK' | 'HIGH';
}

interface StatusValues {
  ph?: ValueStatus;
  ec?: ValueStatus;
  [key: string]: ValueStatus | undefined;
}

/**
 * GET handler for dosing debug information
 * Returns current dosing configuration, sensor readings, and system status
 */
export async function GET() {
  try {
    // Safety check - server side only
    if (typeof window !== 'undefined') {
      return NextResponse.json(
        { status: 'error', error: 'Server side operation only' },
        { status: 400 }
      );
    }

    // Get auto-dosing configuration
    const config = getDosingConfig();
    
    // Get current sensor readings (real or simulated)
    let sensorData;
    let isSimulation = false;
    
    try {
      isSimulation = await isSimulationEnabled();
      
      if (isSimulation) {
        sensorData = await getSimulatedSensorReadings();
      } else {
        sensorData = await getAllSensorReadings();
      }
    } catch (err) {
      console.error('Error getting sensor readings:', err);
      sensorData = { error: 'Failed to get sensor readings' };
    }
    
    // Get pump status
    let pumps: PumpStatus[] | { error: string } = [];
    try {
      pumps = getAllPumpStatus();
    } catch (err) {
      console.error('Error getting pump status:', err);
      pumps = { error: 'Failed to get pump status' };
    }
    
    // Calculate if any readings are outside target ranges
    const valueStatus: StatusValues = {};
    
    if (sensorData && config && config.targets) {
      if (sensorData.ph !== undefined && config.targets.ph) {
        const phTarget = config.targets.ph.target;
        const phTolerance = config.targets.ph.tolerance;
        valueStatus.ph = {
          value: sensorData.ph,
          target: phTarget,
          tolerance: phTolerance,
          min: phTarget - phTolerance,
          max: phTarget + phTolerance,
          status: 
            sensorData.ph < (phTarget - phTolerance) ? 'LOW' :
            sensorData.ph > (phTarget + phTolerance) ? 'HIGH' : 'OK'
        };
      }
      
      if (sensorData.ec !== undefined && config.targets.ec) {
        const ecTarget = config.targets.ec.target;
        const ecTolerance = config.targets.ec.tolerance;
        valueStatus.ec = {
          value: sensorData.ec,
          target: ecTarget,
          tolerance: ecTolerance,
          min: ecTarget - ecTolerance,
          max: ecTarget + ecTolerance,
          status: 
            sensorData.ec < (ecTarget - ecTolerance) ? 'LOW' :
            sensorData.ec > (ecTarget + ecTolerance) ? 'HIGH' : 'OK'
        };
      }
    }
    
    // Get monitoring status
    const monitoringEnabled = isMonitoringEnabled();
    
    // Check active pumps
    let activePumps: string[] = [];
    if (Array.isArray(pumps)) {
      activePumps = pumps.filter(p => p.active).map(p => p.name);
    }
    
    // Return all info
    return NextResponse.json({
      status: 'success',
      debugInfo: {
        timestamp: new Date().toISOString(),
        config: {
          enabled: config.enabled,
          targets: config.targets
        },
        sensors: {
          readings: sensorData,
          isSimulation
        },
        status: {
          monitoringEnabled,
          activePumps,
          valueStatus
        },
        lastDose: config.lastDose
      }
    });
  } catch (err) {
    console.error('[ERROR] [dosing-debug]', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get debug information',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
} 
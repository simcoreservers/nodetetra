import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getUnifiedDosingConfig } from '@/app/lib/dosingMigration';
import { error, info, debug } from '@/app/lib/logger';

const MODULE = 'api:sensors';

/**
 * GET API route for fetching sensor data
 * Returns simulated data when simulation mode is enabled
 * Triggers auto-dosing checks if enabled
 */
export async function GET() {
  try {
    // Check if simulation mode is enabled
    const config = await getSimulationConfig();
    let sensorData;
    
    if (config.enabled) {
      // Use simulated data
      const simulatedData = await getSimulatedSensorReadings();
      
      // Create the response with status property
      sensorData = {
        ...simulatedData,
        status: 'ok'
      };
    } else {
      try {
        // Try to get real sensor readings
        const readings = await getAllSensorReadings();
        sensorData = {
          ...readings,
          timestamp: new Date().toISOString(),
          status: 'ok'
        };
      } catch (error) {
        return NextResponse.json({
          status: 'error',
          error: 'Failed to get sensor readings',
          errorType: 'connection',
          message: error instanceof Error ? error.message : String(error)
        }, { status: 503 }); // Service Unavailable
      }
    }

    // Check if auto-dosing is enabled
    try {
      const dosingConfig = await getUnifiedDosingConfig();
      if (dosingConfig?.enabled) {
        debug(MODULE, 'Auto-dosing enabled - scheduling check with latest sensor readings');
        
        // Use setTimeout to avoid blocking the response
        setTimeout(async () => {
          try {
            // Trigger a dosing check using the API
            const response = await fetch(`${process.env.HOST_URL || 'http://localhost:3000'}/api/dosing/auto`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'dose' }),
            });
            
            if (!response.ok) {
              throw new Error(`Failed to trigger auto-dosing: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success' && data.result) {
              if (data.result.action === 'dosed') {
                info(MODULE, `Auto-dosing triggered successfully: ${data.result.details.type}`);
              } else if (data.result.action === 'waiting') {
                debug(MODULE, `Auto-dosing waiting: ${data.result.details.reason}`);
              } else {
                debug(MODULE, `Auto-dosing not needed: ${data.result.details.reason || 'Parameters within target range'}`);
              }
            }
          } catch (e) {
            error(MODULE, 'Error performing auto-dosing check:', e);
          }
        }, 100);
      }
    } catch (e) {
      error(MODULE, 'Error checking auto-dosing status:', e);
      // Continue to return sensor data even if auto-dosing check fails
    }
    
    // Return the sensor data regardless of auto-dosing status
    return NextResponse.json(sensorData);
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get sensor data',
      errorType: 'unknown',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 }); // Internal Server Error
  }
}

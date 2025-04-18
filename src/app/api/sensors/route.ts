import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getDosingConfig } from '@/app/lib/autoDosing';
import { error, info, debug, warn } from '@/app/lib/logger';

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
      const dosingConfig = getDosingConfig();
      if (dosingConfig?.enabled) {
        debug(MODULE, 'Auto-dosing enabled - scheduling check with latest sensor readings');
        
        // Create a task that runs after response is sent (important: use high delay)
        const taskId = setTimeout(async () => {
          // Don't make too many requests
          const now = Date.now();
          const requestKey = 'last_autodose_request';
          const lastRequest = global[requestKey] || 0;
          
          if (now - lastRequest < 5000) { // 5 second minimum between triggers
            warn(MODULE, `Auto-dosing attempted too frequently, skipping (${now - lastRequest}ms since last request)`);
            return;
          }
          
          global[requestKey] = now;
          
          try {
            debug(MODULE, 'Scheduling auto-dosing check');
            
            // Direct request with absolute URL
            await fetch('http://localhost:3000/api/dosing/auto', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
              },
              body: JSON.stringify({ action: 'dose' }),
            });
          } catch (e) {
            error(MODULE, 'Auto-dosing trigger failed:', e);
          }
        }, 500); // 500ms delay to ensure response is sent first
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

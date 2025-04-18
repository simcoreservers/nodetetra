import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { error, info, debug, warn } from '@/app/lib/logger';

const MODULE = 'api:sensors';

/**
 * GET API route for fetching sensor data
 * Returns simulated data when simulation mode is enabled
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
    
    // Return the sensor data
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

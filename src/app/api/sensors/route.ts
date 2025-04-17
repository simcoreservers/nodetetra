import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { performAutoDosing, getDosingConfig } from '@/app/lib/autoDosing';

/**
 * GET API route for fetching sensor data
 * Returns simulated data when simulation mode is enabled
 * Also checks if auto-dosing is needed and performs dosing if required
 */
export async function GET() {
  try {
    // Check if simulation mode is enabled
    const config = await getSimulationConfig();
    let sensorData;
    
    if (config.enabled) {
      // Use the same simulation method as autoDosing for consistency
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

    // Check if auto-dosing is enabled (only happens during sensor polling)
    try {
      const dosingConfig = getDosingConfig();
      if (dosingConfig.enabled) {
        console.log('Auto-dosing enabled - scheduling check with latest sensor readings');
        // Use setTimeout to avoid blocking the response and check lock status
        setTimeout(() => {
          const { isLocked } = require('@/app/lib/autoDosing');
          if (!isLocked()) {
            performAutoDosing().then(result => {
              if (result.action === 'dosed') {
                console.log(`Auto-dosing triggered successfully: ${result.details.type} (${result.details.amount}ml)`);
              } else if (result.action === 'waiting') {
                console.log(`Auto-dosing waiting: ${result.details.reason}`);
              } else {
                console.log(`Auto-dosing not needed: ${result.details.reason || 'pH and EC within target range'}`);
              }
            }).catch(error => {
              console.error('Error performing auto-dosing check:', error);
            });
          } else {
            console.log('Auto-dosing check skipped - operation already in progress');
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error checking auto-dosing status:', error);
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
import { NextResponse } from 'next/server';
import { getAllSensorReadings, SensorConnectionError, SensorReadingError } from '@/app/lib/sensors';
import { checkSensorDataForAlerts, initializeAlertSystem } from '@/app/lib/alerts';
import { initializeSimulation } from '@/app/lib/simulation';

// Initialize systems
let alertSystemInitialized = false;
let simulationSystemInitialized = false;

/**
 * GET API route for fetching real-time sensor data from Atlas Scientific EZO Circuits
 */
export async function GET() {
  try {
    // Initialize alert system if needed
    if (!alertSystemInitialized) {
      await initializeAlertSystem();
      alertSystemInitialized = true;
    }
    
    // Initialize simulation system if needed
    if (!simulationSystemInitialized) {
      await initializeSimulation();
      simulationSystemInitialized = true;
    }
    
    // Get sensor data
    const sensorData = await getAllSensorReadings();
    
    // Add timestamp
    const dataWithTimestamp = {
      ...sensorData,
      timestamp: new Date().toISOString(),
      status: 'ok'
    };
    
    // Check sensor data against thresholds and generate alerts if needed
    // This runs asynchronously and doesn't block the response
    checkSensorDataForAlerts(dataWithTimestamp).catch(error => {
      console.error('Error checking sensor data for alerts:', error);
    });
    
    // Return sensor data to client
    return NextResponse.json(dataWithTimestamp);
  } catch (error) {
    console.error('Error fetching sensor data:', error);
    
    // Determine error type for appropriate client response
    if (error instanceof SensorConnectionError) {
      return NextResponse.json({
        status: 'error',
        error: 'Sensor connection failed. Please check sensor connections and power.',
        errorType: 'connection',
        message: error.message
      }, { status: 503 }); // Service Unavailable
    }
    
    if (error instanceof SensorReadingError) {
      return NextResponse.json({
        status: 'error',
        error: 'Sensor reading error. Sensor may need calibration or replacement.',
        errorType: 'reading',
        message: error.message
      }, { status: 400 }); // Bad Request (client should handle gracefully)
    }
    
    // Generic error response
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get sensor data',
      errorType: 'unknown',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 }); // Internal Server Error
  }
} 
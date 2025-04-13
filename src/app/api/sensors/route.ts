import { NextResponse } from 'next/server';
import { getAllSensorReadings, SensorConnectionError, SensorReadingError } from '@/app/lib/sensors';
import { checkSensorDataForAlerts, initializeAlertSystem } from '@/app/lib/alerts';

// Initialize alert system
let alertSystemInitialized = false;

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
    
    // Provide specific error information based on the error type
    if (error instanceof SensorConnectionError) {
      return NextResponse.json({
        error: error.message,
        errorType: 'connection',
        status: 'error',
        timestamp: new Date().toISOString()
      }, { status: 503 }); // Service Unavailable
    }
    
    if (error instanceof SensorReadingError) {
      return NextResponse.json({
        error: error.message,
        errorType: 'reading',
        status: 'error',
        timestamp: new Date().toISOString()
      }, { status: 400 }); // Bad Request
    }
    
    // Generic error fallback
    return NextResponse.json({
      error: `Sensor communication error: ${error instanceof Error ? error.message : String(error)}`,
      errorType: 'unknown',
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
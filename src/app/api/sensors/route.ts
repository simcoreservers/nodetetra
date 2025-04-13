import { NextResponse } from 'next/server';
import { getSimulationConfig } from '@/app/lib/simulation';

/**
 * GET API route for fetching sensor data
 * Returns simulated data when simulation mode is enabled
 */
export async function GET() {
  try {
    // Check if simulation mode is enabled
    const config = await getSimulationConfig();
    
    if (config.enabled) {
      // Get baseline and variation values from configuration
      const { baseline, variation } = config;
      
      // Generate simulated data using the configured values
      const randomPh = baseline.ph + (Math.random() * 2 - 1) * variation.ph;
      const randomEc = baseline.ec + (Math.random() * 2 - 1) * variation.ec; 
      const randomTemp = baseline.waterTemp + (Math.random() * 2 - 1) * variation.waterTemp;
      
      return NextResponse.json({
        ph: parseFloat(randomPh.toFixed(2)),
        ec: parseFloat(randomEc.toFixed(2)),
        waterTemp: parseFloat(randomTemp.toFixed(1)),
        timestamp: new Date().toISOString(),
        status: 'ok'
      });
    } else {
      // Simulation mode is not enabled - would try to read from real sensors
      return NextResponse.json({
        status: 'error',
        error: 'Real sensor readings are not available. Please enable simulation mode.',
        errorType: 'connection',
        message: 'Real sensor readings are not available. Please enable simulation mode.'
      }, { status: 503 }); // Service Unavailable
    }
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get sensor data',
      errorType: 'unknown',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 }); // Internal Server Error
  }
} 
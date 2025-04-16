import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getDosingConfig } from '@/app/lib/autoDosing';
import { latestData } from '../stream/route';

// Maximum age for cached data before we need fresh data (in milliseconds)
const MAX_CACHE_AGE = 2000; // 2 seconds

/**
 * GET API route for fetching sensor data
 * Uses cached data from the streaming route when available to avoid duplicate hardware access
 */
export async function GET() {
  try {
    // First check if we have recent cached data from the streaming route
    const now = Date.now();
    if (latestData.sensors && latestData.lastUpdated > 0 && (now - latestData.lastUpdated) < MAX_CACHE_AGE) {
      // We have recent cached data, use it
      return NextResponse.json({
        ...latestData.sensors,
        cachedData: true,
        cacheAge: now - latestData.lastUpdated,
        autoDosing: latestData.autoDosing
      });
    }
    
    // If no active stream or cache is too old, get fresh data
    // This is a fallback for when the streaming service isn't active
    const config = await getSimulationConfig();
    let sensorData: any;
    
    if (config.enabled) {
      // Use the same simulation method as autoDosing for consistency
      const simulatedData = await getSimulatedSensorReadings();
      
      // Create the response with status property
      sensorData = {
        ...simulatedData,
        status: 'ok',
        cachedData: false
      };
    } else {
      try {
        // Try to get real sensor readings
        const readings = await getAllSensorReadings();
        sensorData = {
          ...readings,
          timestamp: new Date().toISOString(),
          status: 'ok',
          cachedData: false
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

    // Add auto-dosing status
    const dosingConfig = getDosingConfig();
    sensorData.autoDosing = {
      enabled: dosingConfig.enabled
    };
    
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
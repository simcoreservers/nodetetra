import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getDosingConfig } from '@/app/lib/autoDosing';
import { latestData } from '../stream/route';

// Maximum age for cached data before we need fresh data (in milliseconds)
const MAX_CACHE_AGE = 5000; // 5 seconds - this is much more reasonable

// Rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second window
const MAX_REQUESTS_PER_WINDOW = 5; // max 5 requests per second
const requestTimestamps: number[] = [];

/**
 * GET API route for fetching sensor data
 * Uses cached data from the streaming route when available to avoid duplicate hardware access
 * Includes rate limiting to prevent excessive polling
 */
export async function GET() {
  try {
    // Apply rate limiting
    const now = Date.now();
    
    // Remove timestamps older than the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
      requestTimestamps.shift();
    }
    
    // Add current timestamp
    requestTimestamps.push(now);
    
    // Check if rate limit exceeded
    if (requestTimestamps.length > MAX_REQUESTS_PER_WINDOW) {
      return NextResponse.json({
        status: 'error',
        error: 'Rate limit exceeded',
        message: `Max ${MAX_REQUESTS_PER_WINDOW} requests per ${RATE_LIMIT_WINDOW}ms. Please use the streaming API for real-time data.`
      }, { status: 429 }); // 429 Too Many Requests
    }
    
    // First check if we have recent cached data from the streaming route
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
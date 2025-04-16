import { NextResponse } from 'next/server';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getDosingConfig } from '@/app/lib/autoDosing';
import { latestData } from '../stream/route';

// Implement a more aggressive rate limiter
const RATE_LIMIT = {
  maxRequests: 3, // Maximum 3 requests
  timeWindow: 1000, // Per 1 second
  requests: [] as number[], // Timestamp array of recent requests
};

// Debugging counter for recent excessive requests
let excessiveRequestsCount = 0;
let lastLoggedExcessive = 0;

// Maximum age for cached data in milliseconds
const MAX_CACHE_AGE = 5000; // 5 seconds

/**
 * GET API route for fetching sensor data
 * Uses cached data from the streaming route when available to avoid duplicate hardware access
 * Includes rate limiting to prevent excessive polling
 */
export async function GET() {
  try {
    // Check if we're getting hit with excessive requests
    const now = Date.now();
    
    // Remove requests outside the time window
    RATE_LIMIT.requests = RATE_LIMIT.requests.filter(time => time > now - RATE_LIMIT.timeWindow);
    
    // If we're over the limit, return 429 Too Many Requests
    if (RATE_LIMIT.requests.length >= RATE_LIMIT.maxRequests) {
      // Increment excessive request counter
      excessiveRequestsCount++;
      
      // Log only once per second to avoid log spam
      if (now - lastLoggedExcessive > 1000) {
        console.warn(`Rate limit exceeded for /api/sensors - blocked ${excessiveRequestsCount} excessive requests in the last second`);
        lastLoggedExcessive = now;
        excessiveRequestsCount = 0;
      }
      
      return NextResponse.json({
        status: 'error',
        error: 'Too many requests',
        errorType: 'rate_limit',
        message: 'Rate limit exceeded, please reduce request frequency'
      }, { status: 429 }); // Too Many Requests
    }
    
    // Add this request to the counter
    RATE_LIMIT.requests.push(now);
    
    // First, check if we have recent cached data from the streaming route
    let sensorData: any;
    
    if (latestData.sensors && latestData.lastUpdated > now - MAX_CACHE_AGE) {
      // Return cached data if it's recent enough
      sensorData = {
        ...latestData.sensors,
        cachedData: true,
        cacheAge: now - latestData.lastUpdated,
      };
      
      // Debug log
      console.log(`Using cached sensor data (${now - latestData.lastUpdated}ms old)`);
    } else {
      // Need to fetch fresh data - first check if simulation is enabled
      const config = await getSimulationConfig();
      
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
import { NextRequest } from 'next/server';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getAllPumpStatus } from '@/app/lib/pumps';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getDosingConfig, performAutoDosing } from '@/app/lib/autoDosing';

// Much faster interval for real-time UI feedback
const DATA_REFRESH_INTERVAL = 300; // 300ms for very responsive updates

// Keep track of last pump state to detect changes
let lastPumpState: any = null;

// Cache for the latest data - will be shared with the REST endpoint
export interface StreamData {
  sensors: {
    ph: number;
    ec: number;
    waterTemp: number;
    tds?: number;
    timestamp: string;
  };
  autoDosing: {
    enabled: boolean;
    timestamp: string;
    pumps?: any;
    lastCheck?: string;
    lastResult?: any;
  };
  lastUpdated: number; // timestamp when data was last fetched from hardware
  lastSent: number; // timestamp when data was last sent to clients
}

export let latestData: StreamData = {
  sensors: {
    ph: 0,
    ec: 0,
    waterTemp: 0,
    timestamp: new Date().toISOString()
  },
  autoDosing: {
    enabled: false,
    timestamp: new Date().toISOString()
  },
  lastUpdated: 0,
  lastSent: 0
};

// Helper function to check if pump state has changed
function hasPumpStateChanged(newPumpState: any, oldPumpState: any): boolean {
  if (!oldPumpState || !newPumpState) return true;
  
  // Simple comparison of active state for each pump
  if (Array.isArray(newPumpState) && Array.isArray(oldPumpState)) {
    if (newPumpState.length !== oldPumpState.length) return true;
    
    for (let i = 0; i < newPumpState.length; i++) {
      if (newPumpState[i]?.active !== oldPumpState[i]?.active) {
        return true;
      }
    }
  }
  return false;
}

// Server-Sent Events (SSE) handler
export async function GET(request: NextRequest) {
  console.log('Streaming API connection established');
  
  // Initialize with fresh data
  try {
    const readings = await getSensorData();
    const pumpStatus = await getAllPumpStatus();
    const dosingConfig = getDosingConfig();
    
    // Update last pump state for change detection
    lastPumpState = pumpStatus;
    
    latestData.sensors = readings;
    latestData.lastUpdated = Date.now();
    latestData.autoDosing = {
      enabled: dosingConfig.enabled,
      timestamp: new Date().toISOString(),
      pumps: pumpStatus
    };
    
    // Immediately check if dosing is needed
    if (dosingConfig.enabled) {
      const dosingResult = await performAutoDosing();
      latestData.autoDosing.lastResult = dosingResult;
    }
  } catch (error) {
    console.error('Initial data fetch failed:', error);
  }

  // Create a stream
  const stream = new ReadableStream({
    async start(controller) {
      let lastSensorReadTime = 0;
      const SENSOR_READ_INTERVAL = 2000; // Read hardware sensors every 2 seconds
      
      // An interval that handles everything: sensor reads, dosing checks, and client updates
      const intervalId = setInterval(async () => {
        try {
          const now = Date.now();
          const dosingConfig = getDosingConfig();
          
          // Always get pump status every cycle for immediate feedback
          const pumpStatus = await getAllPumpStatus();
          const pumpStateChanged = hasPumpStateChanged(pumpStatus, lastPumpState);
          
          // Store current pump state for next comparison
          lastPumpState = pumpStatus;
          
          // Only read sensors at a lower frequency to reduce hardware load
          let readings = latestData.sensors;
          let dosingResult = null;
          const readSensors = now - lastSensorReadTime >= SENSOR_READ_INTERVAL;
          
          if (readSensors) {
            // Get fresh sensor data (less frequently)
            readings = await getSensorData();
            latestData.sensors = readings;
            lastSensorReadTime = now;
            
            // Check if auto-dosing is needed when sensor readings change
            if (dosingConfig.enabled) {
              try {
                dosingResult = await performAutoDosing();
              } catch (error) {
                console.error('Error performing auto-dosing:', error);
              }
            }
          }
          
          // Update cached data
          latestData.lastUpdated = now;
          
          // Update auto-dosing status - always update pumps for immediate feedback
          latestData.autoDosing = {
            enabled: dosingConfig.enabled,
            timestamp: new Date().toISOString(),
            pumps: pumpStatus,
            lastCheck: readSensors ? new Date().toISOString() : latestData.autoDosing.lastCheck,
            lastResult: dosingResult || latestData.autoDosing.lastResult
          };
          
          // Only send updates if something important changed or it's been a while
          const forceUpdate = now - latestData.lastSent > 1000; // Always update at least every second
          
          if (pumpStateChanged || readSensors || forceUpdate) {
            // Send the updated data to the client
            latestData.lastSent = now;
            const message = {
              sensors: latestData.sensors,
              timestamp: new Date().toISOString(),
              autoDosing: latestData.autoDosing,
              pumpStateChanged: pumpStateChanged // Flag so UI can react specifically
            };
            
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
          }
        } catch (error) {
          console.error('Error in stream:', error);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: String(error), timestamp: new Date().toISOString() })}\n\n`)
          );
        }
      }, DATA_REFRESH_INTERVAL);

      // Add abort handler to properly clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        console.log('Client connection aborted');
        clearInterval(intervalId);
      });
      
      // Return cleanup function
      return () => {
        console.log('Client disconnected from streaming API');
        clearInterval(intervalId);
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// Helper function to get sensor data
async function getSensorData() {
  try {
    // First try to get real data
    const readings = await getAllSensorReadings();
    return {
      ...readings,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Fall back to simulated data if real readings fail
    console.log('Falling back to simulated sensor data');
    const readings = await getSimulatedSensorReadings();
    return {
      ...readings,
      timestamp: new Date().toISOString()
    };
  }
} 
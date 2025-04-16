import { NextRequest } from 'next/server';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getAllPumpStatus } from '@/app/lib/pumps';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getDosingConfig, performAutoDosing } from '@/app/lib/autoDosing';

// A single interval for everything - sensor reads, dosing checks, and client updates
const DATA_REFRESH_INTERVAL = 1000; // 1-second refresh rate for everything

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

// Server-Sent Events (SSE) handler
export async function GET(request: NextRequest) {
  console.log('Streaming API connection established');
  
  // Initialize with fresh data
  try {
    const readings = await getSensorData();
    const dosingConfig = getDosingConfig();
    const pumpStatus = await getAllPumpStatus();
    
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
      // An interval that handles everything: sensor reads, dosing checks, and client updates
      const intervalId = setInterval(async () => {
        try {
          // 1. Get fresh sensor data
          const readings = await getSensorData();
          const dosingConfig = getDosingConfig();
          const pumpStatus = await getAllPumpStatus();
          
          // 2. Update cached data
          latestData.sensors = readings;
          latestData.lastUpdated = Date.now();
          
          // 3. Check if auto-dosing is needed immediately based on the new readings
          let dosingResult = null;
          if (dosingConfig.enabled) {
            try {
              dosingResult = await performAutoDosing();
            } catch (error) {
              console.error('Error performing auto-dosing:', error);
            }
          }
          
          // 4. Update auto-dosing status
          latestData.autoDosing = {
            enabled: dosingConfig.enabled,
            timestamp: new Date().toISOString(),
            pumps: pumpStatus,
            lastCheck: new Date().toISOString(),
            lastResult: dosingResult
          };
          
          // 5. Send the updated data to the client
          latestData.lastSent = Date.now();
          const message = {
            sensors: latestData.sensors,
            timestamp: new Date().toISOString(),
            autoDosing: latestData.autoDosing
          };
          
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
        } catch (error) {
          console.error('Error in stream:', error);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`)
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
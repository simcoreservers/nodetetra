import { NextRequest } from 'next/server';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getAllPumpStatus } from '@/app/lib/pumps';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getDosingConfig, performAutoDosing } from '@/app/lib/autoDosing';

// Track active stream connections
const CLIENTS = new Set<ReadableStreamController<Uint8Array>>();
let streamInterval: NodeJS.Timeout | null = null;
const STREAM_INTERVAL = 1000; // Send updates every 1 second instead of 500ms
const SENSOR_FETCH_INTERVAL = 5000; // Fetch sensor data only every 5 seconds

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

// Start stream interval handler
function startStreamInterval() {
  if (streamInterval) {
    return; // Interval already running
  }
  
  streamInterval = setInterval(async () => {
    try {
      // Only fetch new data if we have active clients
      if (CLIENTS.size === 0) {
        if (streamInterval) {
          clearInterval(streamInterval);
          streamInterval = null;
          console.log('No active clients, stopping stream interval');
        }
        return;
      }
      
      // Get latest sensor data
      const currentTimestamp = new Date().toISOString();
      const dosingConfig = getDosingConfig();
      const pumpStatus = await getAllPumpStatus();
      
      // Attempt auto-dosing if enabled
      let dosingResult = null;
      if (dosingConfig.enabled) {
        try {
          dosingResult = await performAutoDosing();
        } catch (err) {
          console.error('Error performing auto-dosing:', err);
        }
      }
      
      // Send message to all clients
      const message = {
        sensors: latestData.sensors,
        timestamp: currentTimestamp,
        autoDosing: {
          enabled: dosingConfig.enabled,
          timestamp: currentTimestamp,
          pumps: pumpStatus,
          lastResult: dosingResult
        }
      };
      
      CLIENTS.forEach(controller => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
      });
    } catch (error) {
      console.error('Error in stream interval:', error);
    }
  }, STREAM_INTERVAL);
}

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
  } catch (error) {
    console.error('Initial sensor data fetch failed:', error);
  }

  // Create a stream
  const stream = new ReadableStream({
    async start(controller) {
      // Add new client
      CLIENTS.add(controller);
      console.log(`New client connected, active clients: ${CLIENTS.size}`);
      
      // Keep track of the last autoDosing check time
      let lastDosingCheck = 0;
      let lastSensorFetch = Date.now();
      
      // Stream loop
      const intervalId = setInterval(async () => {
        try {
          const now = Date.now();
          const dosingConfig = getDosingConfig();
          
          // Only fetch fresh sensor data every SENSOR_FETCH_INTERVAL
          let readings;
          if (now - lastSensorFetch >= SENSOR_FETCH_INTERVAL) {
            readings = await getSensorData();
            latestData.sensors = readings;
            latestData.lastUpdated = now;
            lastSensorFetch = now;
          } else {
            readings = latestData.sensors;
          }
          
          // Don't send data if nothing has changed since last send
          // and it's been less than 2 seconds (heartbeat interval)
          if (latestData.lastSent > 0 && 
              now - latestData.lastSent < 2000 && 
              now - latestData.lastUpdated > SENSOR_FETCH_INTERVAL) {
            return; // Skip this update cycle
          }
          
          // Only check auto-dosing every 10 seconds to avoid excessive dosing attempts
          let dosingResult = null;
          if (dosingConfig.enabled && now - lastDosingCheck >= 10000) {
            dosingResult = await performAutoDosing();
            lastDosingCheck = now;
          }
          
          const pumpStatus = await getAllPumpStatus();
          
          // Update auto-dosing status
          latestData.autoDosing = {
            enabled: dosingConfig.enabled,
            timestamp: new Date().toISOString(),
            pumps: pumpStatus,
            lastCheck: lastDosingCheck > 0 ? new Date(lastDosingCheck).toISOString() : undefined,
            lastResult: dosingResult
          };
          
          // Update last sent timestamp
          latestData.lastSent = now;
          
          // Send the data
          const message = {
            sensors: readings,
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
      }, STREAM_INTERVAL);

      // Add abort handler to properly clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        console.log('Client connection aborted, removing from active clients');
        CLIENTS.delete(controller);
        clearInterval(intervalId);
        console.log(`Remaining active clients: ${CLIENTS.size}`);
      });
      
      // Return cleanup function
      return () => {
        console.log('Client disconnected from streaming API');
        CLIENTS.delete(controller);
        clearInterval(intervalId);
        console.log(`Remaining active clients: ${CLIENTS.size}`);
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
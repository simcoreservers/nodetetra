import { NextRequest, NextResponse } from 'next/server';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getAllPumpStatus } from '@/app/lib/pumps';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { getDosingConfig } from '@/app/lib/autoDosing';

// Track active stream connections
const CLIENTS = new Set<ReadableStreamController<Uint8Array>>();
let streamInterval: NodeJS.Timeout | null = null;
const STREAM_INTERVAL_MS = 500; // .5 second update interval

// Cache for the latest data - will be shared with the REST endpoint
export interface CachedData {
  sensors: any;
  pumps: any;
  autoDosing: {
    enabled: boolean;
    timestamp: string;
  };
  lastUpdated: number; // timestamp when data was last fetched from hardware
}

// Initialize with empty data
export let latestData: CachedData = {
  sensors: null,
  pumps: null,
  autoDosing: {
    enabled: false,
    timestamp: new Date().toISOString()
  },
  lastUpdated: 0
};

function startStreamInterval() {
  if (streamInterval) return; // Only start if not already running
  
  console.log('Starting data stream interval');
  streamInterval = setInterval(async () => {
    if (CLIENTS.size === 0) {
      // No clients, clear the interval to save resources
      if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
        console.log('Stopped data stream interval - no clients connected');
      }
      return;
    }
    
    try {
      // Get sensor data
      let sensorData: any;
      const simulationConfig = await getSimulationConfig();
      
      if (simulationConfig.enabled) {
        sensorData = await getSimulatedSensorReadings();
      } else {
        try {
          sensorData = await getAllSensorReadings();
        } catch (error) {
          sensorData = { error: 'Failed to get sensor readings', status: 'error' };
        }
      }
      
      // Get complete pump status (including nutrient information)
      let pumpData: any;
      try {
        pumpData = getAllPumpStatus();
        // Ensure all pump properties are included and properly serialized
        // This ensures nutrient information is properly included
      } catch (error) {
        pumpData = { error: 'Failed to get pump status', status: 'error' };
      }
      
      // Get auto-dosing status (no longer performing checks here as it's handled by background interval)
      const dosingConfig = getDosingConfig();
      
      // Format the data
      const currentTimestamp = new Date().toISOString();
      
      // Update the shared cache with latest data
      latestData = {
        sensors: {
          ...sensorData,
          timestamp: currentTimestamp
        },
        pumps: pumpData,
        autoDosing: {
          enabled: dosingConfig.enabled,
          timestamp: currentTimestamp
        },
        lastUpdated: Date.now()
      };
      
      // Send to all connected clients
      const event = `data: ${JSON.stringify({
        sensors: latestData.sensors,
        pumps: latestData.pumps,
        autoDosing: latestData.autoDosing
      })}\n\n`;
      
      // Create a clean-up list for controllers to remove
      const controllersToRemove = new Set<ReadableStreamController<Uint8Array>>();
      
      // Attempt to send to each client
      CLIENTS.forEach(controller => {
        try {
          // Check if controller is closed before trying to enqueue
          if (controller.desiredSize === null) {
            // Controller is closed, mark for removal
            controllersToRemove.add(controller);
          } else {
            controller.enqueue(new TextEncoder().encode(event));
          }
        } catch (error) {
          console.error('Error sending data to client:', error);
          // Mark controller for removal
          controllersToRemove.add(controller);
        }
      });
      
      // Clean up any closed or failed controllers
      if (controllersToRemove.size > 0) {
        console.log(`Removing ${controllersToRemove.size} closed controllers`);
        controllersToRemove.forEach(controller => {
          CLIENTS.delete(controller);
        });
        console.log(`Remaining active clients: ${CLIENTS.size}`);
      }
    } catch (error) {
      console.error('Error in stream interval:', error);
    }
  }, STREAM_INTERVAL_MS);
}

// Server-Sent Events (SSE) handler
export async function GET(request: NextRequest) {
  // Create stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add new client
      CLIENTS.add(controller);
      console.log(`New client connected, active clients: ${CLIENTS.size}`);
      
      // Start the interval if it's not running
      startStreamInterval();
      
      // Initial connection message
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ connected: true, clients: CLIENTS.size })}\n\n`));
      
      // Add abort handler to properly clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        console.log('Client connection aborted, removing from active clients');
        CLIENTS.delete(controller);
        console.log(`Remaining active clients: ${CLIENTS.size}`);
      });
    },
    cancel() {
      // This is called when the client disconnects normally
      console.log('Client disconnected, removing from active clients');
      CLIENTS.forEach(c => {
        // Find the controller that matches this stream (can't access directly in this context)
        if (c.desiredSize === null) {
          CLIENTS.delete(c);
        }
      });
      console.log(`Remaining active clients: ${CLIENTS.size}`);
    }
  });
  
  // Return the stream as SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
} 
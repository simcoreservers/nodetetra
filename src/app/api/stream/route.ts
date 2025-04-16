import { NextRequest, NextResponse } from 'next/server';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getAllPumpStatus } from '@/app/lib/pumps';
import { getSimulationConfig, getSimulatedSensorReadings } from '@/app/lib/simulation';
import { performAutoDosing, getDosingConfig } from '@/app/lib/autoDosing';

// Track active stream connections
const CLIENTS = new Set<ReadableStreamController<Uint8Array>>();
let streamInterval: NodeJS.Timeout | null = null;
const STREAM_INTERVAL_MS = 500; // .5 second update interval

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
      
      // Check if auto-dosing is needed
      const dosingConfig = getDosingConfig();
      if (dosingConfig.enabled) {
        // Perform dosing check in the background (don't wait for it)
        performAutoDosing().then(result => {
          if (result.action === 'dosed') {
            console.log(`Auto-dosing triggered: ${result.details.type} (${result.details.amount}ml)`);
          }
        }).catch(err => {
          console.error('Error in auto-dosing check:', err);
        });
      }
      
      // Format the data for SSE
      const data = {
        sensors: {
          ...sensorData,
          timestamp: new Date().toISOString()
        },
        pumps: pumpData,
        autoDosing: {
          enabled: dosingConfig.enabled,
          timestamp: new Date().toISOString()
        }
      };
      
      // Send to all connected clients
      const event = `data: ${JSON.stringify(data)}\n\n`;
      for (const controller of CLIENTS) {
        try {
          controller.enqueue(new TextEncoder().encode(event));
        } catch (error) {
          console.error('Error sending to client, removing from active clients:', error);
          CLIENTS.delete(controller);
        }
      }
    } catch (error) {
      console.error('Error in stream interval:', error);
    }
  }, STREAM_INTERVAL_MS);
}

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      // Add this client to the set of active clients
      CLIENTS.add(controller);
      
      // Send initial headers for SSE
      controller.enqueue(new TextEncoder().encode(': ping\n\n'));
      
      // Start the interval if it's not running
      startStreamInterval();
      
      // When the connection is closed, remove this client
      request.signal.addEventListener('abort', () => {
        CLIENTS.delete(controller);
        console.log(`Client disconnected, active clients: ${CLIENTS.size}`);
      });
      
      console.log(`New client connected, active clients: ${CLIENTS.size}`);
    },
    cancel() {
      // If the client disconnects, remove them from the set
      for (const controller of CLIENTS) {
        if (controller.desiredSize === 0) {
          CLIENTS.delete(controller);
        }
      }
      console.log(`Client manually disconnected, active clients: ${CLIENTS.size}`);
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none',
    },
  });
} 
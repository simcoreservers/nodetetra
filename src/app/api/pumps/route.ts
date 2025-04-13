import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllPumpStatus, 
  getRecentEvents, 
  activatePump, 
  deactivatePump, 
  dispensePump,
  assignNutrientToPump,
  PumpName,
  loadPumpConfig,
  initializePumps,
  ensureDevPumpsInitialized
} from '../../lib/pumps';

// Initialize pumps when the server starts
try {
  // Use different initialization for development vs production
  if (process.env.NODE_ENV === 'development') {
    // Initialize for development (no hardware)
    ensureDevPumpsInitialized();
  } else {
    // Production initialization
    loadPumpConfig();
    
    // Initialize the pumps (this is a no-op in client-side)
    // We're not awaiting this because Next.js route handlers should be synchronous at the top level
    initializePumps().catch(error => {
      console.error('Failed to initialize pumps:', error);
    });
  }
  
  console.log(`Pump initialization triggered in ${process.env.NODE_ENV} mode`);
} catch (error) {
  console.error('Error during pump initialization:', error);
}

/**
 * GET API route for fetching current pump status and recent events
 */
export async function GET() {
  try {
    // Ensure configuration is loaded before responding
    if (process.env.NODE_ENV === 'development') {
      ensureDevPumpsInitialized();
    } else {
      loadPumpConfig();
    }
    
    const pumpStatus = getAllPumpStatus();
    const recentEvents = getRecentEvents(10); // Get 10 most recent events

    return NextResponse.json({
      pumpStatus,
      recentEvents,
      timestamp: new Date().toISOString(),
      status: 'ok'
    });
  } catch (error) {
    console.error('Error fetching pump data:', error);
    
    return NextResponse.json({
      error: `Failed to fetch pump data: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// POST endpoint for pump control actions
export async function POST(request: NextRequest) {
  try {
    // Ensure configuration is loaded before making changes
    if (process.env.NODE_ENV === 'development') {
      ensureDevPumpsInitialized();
    } else {
      loadPumpConfig();
    }
    
    const data = await request.json();
    const { action, pumpName } = data;
    
    if (!action || !pumpName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    // Validate pump name
    if (!['pH Up', 'pH Down', 'Pump 1', 'Pump 2', 'Pump 3', 'Pump 4'].includes(pumpName)) {
      return NextResponse.json(
        { error: 'Invalid pump name' },
        { status: 400 }
      );
    }
    
    // Handle different pump actions
    switch (action) {
      case 'activate':
        await activatePump(pumpName as PumpName);
        break;
        
      case 'deactivate':
        await deactivatePump(pumpName as PumpName);
        break;
        
      case 'dispense':
        const { amount, flowRate } = data;
        if (!amount || !flowRate) {
          return NextResponse.json(
            { error: 'Missing amount or flowRate parameters for dispense action' },
            { status: 400 }
          );
        }
        await dispensePump(pumpName as PumpName, amount, flowRate);
        break;

      case 'assignNutrient':
        const { nutrient } = data;
        if (nutrient && !nutrient.productId) {
          return NextResponse.json(
            { error: 'Invalid nutrient data' },
            { status: 400 }
          );
        }
        assignNutrientToPump(pumpName as PumpName, nutrient);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    // Return updated pump status and events
    const pumpStatus = getAllPumpStatus();
    const recentEvents = getRecentEvents(10);
    
    return NextResponse.json({
      success: true,
      action,
      pumpName,
      pumpStatus,
      recentEvents,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in pumps API:', error);
    return NextResponse.json(
      { error: 'Failed to execute pump action', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 
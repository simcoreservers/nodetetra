import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
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

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Check if WiringPi/GPIO utility is installed
async function checkGpioUtility() {
  try {
    const { stdout } = await execAsync('gpio -v');
    console.log('GPIO utility version:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.error('GPIO utility not available:', error);
    return false;
  }
}

// Initialize pumps when the server starts
try {
  // Check if we have GPIO utility installed
  checkGpioUtility().then(async (gpioAvailable) => {
    if (!gpioAvailable) {
      console.error('WARNING: WiringPi GPIO utility not found. Pump control will not work properly.');
      console.error('Please install WiringPi: https://github.com/WiringPi/WiringPi');
    }
    
    // Use consistent initialization for both development and production
    try {
      console.log(`Starting pump initialization in ${process.env.NODE_ENV} mode`);
      
      // Load configuration first (this will also restore saved pump states)
      loadPumpConfig();
      
      if (process.env.NODE_ENV === 'development') {
        // Initialize in development mode with real hardware access
        console.log('Initializing pumps in development mode with real hardware access');
        
        // Use the shared initialization for all environments
        await initializePumps();
      } else {
        // Production initialization (same steps)
        await initializePumps();
        console.log('Pumps initialized successfully in production mode');
      }
      
      // Get current pump status after initialization
      const currentStatus = getAllPumpStatus();
      const activeCount = currentStatus.filter(pump => pump.active).length;
      
      if (activeCount > 0) {
        console.log(`Warning: ${activeCount} pumps are currently active after initialization`);
      }
      
      console.log('Pump initialization completed successfully');
    } catch (initError) {
      console.error('Failed to initialize pumps:', initError);
    }
  }).catch(error => {
    console.error('Error checking GPIO utility:', error);
  });
} catch (error) {
  console.error('Error during pump initialization:', error);
}

/**
 * GET API route for fetching current pump status and recent events
 */
export async function GET() {
  try {
    // No need to reinitialize every time - just make sure config is loaded
    // This maintains the pump state between requests
    loadPumpConfig();
    
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
    // Check if GPIO utility is available
    const gpioAvailable = await checkGpioUtility();
    if (!gpioAvailable) {
      return NextResponse.json(
        { 
          error: 'GPIO utility (WiringPi) not found. Please install WiringPi for pump control.',
          details: 'Run: git clone https://github.com/WiringPi/WiringPi && cd WiringPi && ./build'
        },
        { status: 500 }
      );
    }
    
    // Ensure configuration is loaded before making changes
    // This will also restore saved pump states
    loadPumpConfig();
    
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
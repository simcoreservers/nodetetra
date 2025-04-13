import { NextRequest, NextResponse } from 'next/server';
import { 
  getSimulationConfig, 
  updateSimulationConfig,
  resetSimulation,
  SimulationConfig 
} from '@/app/lib/simulation';

// Define interface for simulation update request
interface SimulationUpdateRequest extends Partial<SimulationConfig> {
  reset?: boolean; // Optional flag to reset simulation to baseline values
}

/**
 * GET API route for fetching simulation settings
 */
export async function GET() {
  try {
    // Get simulation configuration
    const config = await getSimulationConfig();
    
    // Return configuration to client
    return NextResponse.json({
      ...config,
      status: 'ok'
    });
  } catch (error) {
    console.error('Error fetching simulation configuration:', error);
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get simulation configuration',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * POST API route for updating simulation settings
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const updates = await request.json() as SimulationUpdateRequest;
    
    // Update simulation configuration (excluding reset flag)
    const { reset, ...configUpdates } = updates;
    const updatedConfig = await updateSimulationConfig(configUpdates);
    
    // Reset simulation if requested
    if (reset) {
      await resetSimulation();
    }
    
    // Return updated configuration to client
    return NextResponse.json({
      ...updatedConfig,
      status: 'ok'
    });
  } catch (error) {
    console.error('Error updating simulation configuration:', error);
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to update simulation configuration',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
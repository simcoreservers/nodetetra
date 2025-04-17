import { NextRequest, NextResponse } from 'next/server';
// Updated to use local functions
import fs from 'fs/promises';
import path from 'path';
import { error, info } from '@/app/lib/logger';

const MODULE = 'api:dosing';

// Path constants
const DATA_PATH = path.join(process.cwd(), 'data');
const UNIFIED_FILE = path.join(DATA_PATH, 'dosing-config.json');

/**
 * Get the unified dosing configuration
 */
async function getUnifiedDosingConfig() {
  try {
    // Read the unified config
    const fileData = await fs.readFile(UNIFIED_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (err) {
    error(MODULE, 'Failed to get unified config', err);
    return null;
  }
}

/**
 * Save the unified dosing configuration
 */
async function saveUnifiedDosingConfig(config) {
  try {
    // Ensure data directory exists
    try {
      await fs.access(DATA_PATH);
    } catch {
      await fs.mkdir(DATA_PATH, { recursive: true });
    }
    
    // Write the config
    await fs.writeFile(UNIFIED_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    error(MODULE, 'Failed to save unified config', err);
    return false;
  }
}
const MODULE = 'api:dosing';

/**
 * GET handler for combined dosing API
 * Returns the unified dosing configuration
 */
export async function GET() {
  try {
    // Get the unified config
    const config = await getUnifiedDosingConfig();
    
    if (!config) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load dosing configuration' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      status: 'success',
      config,
    });
  } catch (err) {
    error(MODULE, 'Error getting dosing config:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get dosing configuration',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for unified dosing API
 * Supports multiple actions: update, enable, disable, reset
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config: configUpdates } = body;
    
    if (!action) {
      return NextResponse.json(
        { status: 'error', error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    // Get current config
    const currentConfig = await getUnifiedDosingConfig();
    if (!currentConfig) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load current configuration' },
        { status: 500 }
      );
    }
    
    // Handle different actions
    switch (action) {
      case 'update':
        if (!configUpdates) {
          return NextResponse.json(
            { status: 'error', error: 'Missing config parameter for update action' },
            { status: 400 }
          );
        }
        
        // Deep merge updates with current config
        const updatedConfig = {
          ...currentConfig,
          ...configUpdates,
          targets: {
            ...currentConfig.targets,
            ...(configUpdates.targets || {})
          },
          pumps: {
            ...currentConfig.pumps,
            ...(configUpdates.pumps || {})
          },
          schedule: {
            ...currentConfig.schedule,
            ...(configUpdates.schedule || {})
          },
          lastDose: {
            ...currentConfig.lastDose,
            ...(configUpdates.lastDose || {})
          }
        };
        
        // Save updated config
        const saveResult = await saveUnifiedDosingConfig(updatedConfig);
        
        if (!saveResult) {
          return NextResponse.json(
            { status: 'error', error: 'Failed to save updated configuration' },
            { status: 500 }
          );
        }
        
        return NextResponse.json({
          status: 'success',
          config: updatedConfig
        });
        
      case 'enable':
        currentConfig.enabled = true;
        await saveUnifiedDosingConfig(currentConfig);
        
        return NextResponse.json({
          status: 'success',
          config: currentConfig
        });
        
      case 'disable':
        currentConfig.enabled = false;
        await saveUnifiedDosingConfig(currentConfig);
        
        return NextResponse.json({
          status: 'success',
          config: currentConfig
        });
        
      case 'reset':
        // Create a basic reset config preserving some settings
        const resetConfig = {
          ...currentConfig,
          version: currentConfig.version,
          migratedAt: currentConfig.migratedAt,
          enabled: false,
          targets: {
            ph: {
              min: 5.8,
              max: 6.2,
              target: 6.0,
              tolerance: 0.2
            },
            ec: {
              min: 1.2,
              max: 1.6,
              target: 1.4,
              tolerance: 0.1
            }
          },
          // Preserve pump configurations but reset timestamps
          lastDose: {
            phUp: null,
            phDown: null,
            nutrientPumps: {}
          }
        };
        
        await saveUnifiedDosingConfig(resetConfig);
        
        return NextResponse.json({
          status: 'success',
          config: resetConfig
        });
        
      default:
        return NextResponse.json(
          { status: 'error', error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    error(MODULE, 'Error in dosing API:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process dosing request',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { 
  loadPumpConfig, 
  savePumpConfig,
  getAllPumpStatus,
  ensureDevPumpsInitialized
} from '../../../lib/pumps';

// Path to the pump config file
const DATA_PATH = path.join(process.cwd(), 'data');
const PUMP_CONFIG_FILE = path.join(DATA_PATH, 'pump_config.json');

/**
 * GET route for debugging pump configuration
 */
export async function GET(request: NextRequest) {
  try {
    // Force reload of configuration
    if (process.env.NODE_ENV === 'development') {
      ensureDevPumpsInitialized();
    } else {
      loadPumpConfig();
    }
    
    // Get current pump status
    const pumpStatus = getAllPumpStatus();
    
    // Check if the config file exists
    const configExists = fs.existsSync(PUMP_CONFIG_FILE);
    
    // Read the raw config file if it exists
    let rawConfig = null;
    if (configExists) {
      try {
        const fileContents = fs.readFileSync(PUMP_CONFIG_FILE, 'utf8');
        rawConfig = JSON.parse(fileContents);
      } catch (readError) {
        console.error('Error reading config file:', readError);
      }
    }
    
    // Get file stats
    let fileStats = null;
    if (configExists) {
      try {
        fileStats = fs.statSync(PUMP_CONFIG_FILE);
      } catch (statError) {
        console.error('Error getting file stats:', statError);
      }
    }
    
    // Debug information for data directory
    let dataDirStats = null;
    if (fs.existsSync(DATA_PATH)) {
      try {
        dataDirStats = fs.statSync(DATA_PATH);
        
        // List files in data directory
        const dataDir = fs.readdirSync(DATA_PATH);
        dataDirStats = {
          ...dataDirStats,
          files: dataDir
        };
      } catch (dirStatError) {
        console.error('Error getting data directory stats:', dirStatError);
      }
    }
    
    return NextResponse.json({
      environmentMode: process.env.NODE_ENV,
      configDirectory: {
        path: DATA_PATH,
        exists: fs.existsSync(DATA_PATH),
        stats: dataDirStats
      },
      configFile: {
        path: PUMP_CONFIG_FILE,
        exists: configExists,
        stats: fileStats,
        content: rawConfig
      },
      inMemoryPumpStatus: pumpStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in pump test route:', error);
    
    return NextResponse.json({
      error: `Failed to get pump debugging info: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST route to force save of current configuration
 */
export async function POST() {
  try {
    // Force save of the current configuration
    savePumpConfig();
    
    return NextResponse.json({
      success: true,
      message: 'Pump configuration forcibly saved',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in pump test route:', error);
    
    return NextResponse.json({
      error: `Failed to save pump configuration: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { initializeServer } from '@/app/lib/server-init';

// Path to data files
const DATA_PATH = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');
const AUTODOSING_FILE = path.join(DATA_PATH, 'autodosing.json');

/**
 * Ensure all required data files exist with default values
 */
async function ensureDataFiles() {
  try {
    // Ensure data directory exists
    if (!existsSync(DATA_PATH)) {
      await fs.mkdir(DATA_PATH, { recursive: true });
      console.log('Created data directory');
    }
    
    // Create default profiles if needed
    if (!existsSync(PROFILES_FILE)) {
      const defaultProfile = {
        name: "Default",
        cropType: "General Hydroponic",
        targetPh: { min: 5.8, max: 6.2 },
        targetEc: { min: 1.2, max: 1.6 },
        notes: "Default profile with general settings for most plants",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await fs.writeFile(
        PROFILES_FILE,
        JSON.stringify([defaultProfile], null, 2),
        'utf8'
      );
      console.log('Created default profile');
    }
    
    // Create active profile reference if needed
    if (!existsSync(ACTIVE_PROFILE_FILE)) {
      await fs.writeFile(
        ACTIVE_PROFILE_FILE,
        JSON.stringify({ activeName: "Default" }, null, 2),
        'utf8'
      );
      console.log('Created active profile reference');
    }
    
    // Create default dosing config if needed
    if (!existsSync(DOSING_FILE)) {
      const defaultDosing = {
        settings: {
          targetPh: {
            min: 5.8,
            max: 6.2,
            current: 6.0
          },
          targetEc: {
            min: 1.2,
            max: 1.5,
            current: 1.35
          },
          dosingLimits: {
            "pH Up": 50,
            "pH Down": 50,
            "Nutrient A": 100,
            "Nutrient B": 100
            // Additional pumps can be added dynamically as needed
          },
          timestamp: new Date().toISOString()
        },
        history: []
      };
      
      await fs.writeFile(
        DOSING_FILE,
        JSON.stringify(defaultDosing, null, 2),
        'utf8'
      );
      console.log('Created default dosing configuration');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error ensuring data files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function GET() {
  try {
    // Ensure all required data files exist
    const fileResult = await ensureDataFiles();
    if (!fileResult.success) {
      console.error('Error ensuring data files:', fileResult.error);
    }
    
    // Initialize server subsystems
    await initializeServer();
    
    return NextResponse.json({
      status: 'ok',
      message: 'System initialized',
      fileSetup: fileResult
    });
  } catch (error) {
    console.error('Error initializing system:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
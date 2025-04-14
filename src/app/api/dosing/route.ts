import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { DosingData } from '@/app/hooks/useDosingData';

// Path to the dosing JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');

// Helper to ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(DATA_PATH, { recursive: true });
  }
}

// Helper to read dosing data from file
async function getDosingData(): Promise<DosingData> {
  try {
    await ensureDataDir();
    try {
      const fileData = await fs.readFile(DOSING_FILE, 'utf8');
      return JSON.parse(fileData);
    } catch (error) {
      console.log(`Error reading dosing file: ${error instanceof Error ? error.message : String(error)}`);
      
      // Create default data
      const defaultData: DosingData = {
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
      
      // Save the default data to file
      try {
        await saveDosingData(defaultData);
        console.log('Created default dosing.json file');
      } catch (saveError) {
        console.error('Error creating default dosing file:', saveError);
      }
      
      return defaultData;
    }
  } catch (error) {
    console.error(`Error accessing data directory: ${error instanceof Error ? error.message : String(error)}`);
    // Return default data on directory access error
    return {
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
  }
}

// Helper to write dosing data to file
async function saveDosingData(data: DosingData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DOSING_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET handler - retrieve all dosing data
export async function GET(request: NextRequest) {
  try {
    const dosingData = await getDosingData();
    return NextResponse.json(dosingData);
  } catch (error) {
    console.error('Error fetching dosing data:', error);
    // Return default data instead of an error
    return NextResponse.json({
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
    });
  }
}

// Placeholder for future PUT/POST methods that will update specific dosing settings
// For a complete implementation, add more route handlers here 
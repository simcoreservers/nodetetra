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
    const fileData = await fs.readFile(DOSING_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (error) {
    // If file doesn't exist or has invalid JSON, return default data
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
        dosingSchedule: "Continuous",
        dosingLimits: {
          phUp: 50,
          phDown: 50,
          nutrientA: 100,
          nutrientB: 100
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
    return NextResponse.json(
      { error: 'Failed to fetch dosing data' },
      { status: 500 }
    );
  }
}

// Placeholder for future PUT/POST methods that will update specific dosing settings
// For a complete implementation, add more route handlers here 
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Path to the calibration data file
const DATA_PATH = path.join(process.cwd(), 'data');
const CALIBRATION_FILE = path.join(DATA_PATH, 'calibration.json');

interface CalibrationData {
  ph: {
    lowPoint: { reading: number; voltage: number };
    midPoint: { reading: number; voltage: number };
    highPoint: { reading: number; voltage: number };
    lastCalibrated: string | null;
    isCalibrated: boolean;
  };
  ec: {
    point: { reading: number; voltage: number };
    lastCalibrated: string | null;
    isCalibrated: boolean;
  };
  temperature: {
    offset: number;
    referenceReading: number;
    sensorReading: number;
    lastCalibrated: string | null;
    isCalibrated: boolean;
  };
}

// Helper to ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(DATA_PATH, { recursive: true });
  }
}

// Helper to read calibration data from file
async function getCalibrationData(): Promise<CalibrationData> {
  try {
    await ensureDataDir();
    const fileData = await fs.readFile(CALIBRATION_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (error) {
    // If file doesn't exist or has invalid JSON, return default data
    return {
      ph: {
        lowPoint: { reading: 4.0, voltage: 0 },
        midPoint: { reading: 7.0, voltage: 0 },
        highPoint: { reading: 10.0, voltage: 0 },
        lastCalibrated: null,
        isCalibrated: false
      },
      ec: {
        point: { reading: 1.413, voltage: 0 },
        lastCalibrated: null,
        isCalibrated: false
      },
      temperature: {
        offset: 0,
        referenceReading: 25.0,
        sensorReading: 25.0,
        lastCalibrated: null,
        isCalibrated: false
      }
    };
  }
}

// Helper to save calibration data to file
async function saveCalibrationData(data: CalibrationData) {
  await ensureDataDir();
  await fs.writeFile(CALIBRATION_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET handler - retrieve all calibration data
export async function GET(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    return NextResponse.json(calibrationData);
  } catch (error) {
    console.error('Error fetching calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calibration data' },
      { status: 500 }
    );
  }
}

// DELETE handler - reset all calibration data
export async function DELETE(request: NextRequest) {
  try {
    // Reset all calibration data
    const calibrationData: CalibrationData = {
      ph: {
        lowPoint: { reading: 4.0, voltage: 0 },
        midPoint: { reading: 7.0, voltage: 0 },
        highPoint: { reading: 10.0, voltage: 0 },
        lastCalibrated: null,
        isCalibrated: false
      },
      ec: {
        point: { reading: 1.413, voltage: 0 },
        lastCalibrated: null,
        isCalibrated: false
      },
      temperature: {
        offset: 0,
        referenceReading: 25.0,
        sensorReading: 25.0,
        lastCalibrated: null,
        isCalibrated: false
      }
    };
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      message: 'All calibration data reset successfully'
    });
  } catch (error) {
    console.error('Error resetting calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to reset calibration data' },
      { status: 500 }
    );
  }
} 
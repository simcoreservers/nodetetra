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
      }
    };
  }
}

// Helper to save calibration data to file
async function saveCalibrationData(data: CalibrationData) {
  await ensureDataDir();
  await fs.writeFile(CALIBRATION_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET handler - retrieve EC calibration data
export async function GET(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    return NextResponse.json(calibrationData.ec);
  } catch (error) {
    console.error('Error fetching EC calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch EC calibration data' },
      { status: 500 }
    );
  }
}

// POST handler - update EC calibration data
export async function POST(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    const newData = await request.json();
    
    // Validate the data
    if (!newData.reading) {
      return NextResponse.json(
        { error: 'Invalid calibration data. Required: reading' },
        { status: 400 }
      );
    }
    
    // For Atlas Scientific EZO EC sensors, we would send:
    // Cal,<conductivity in μS/cm> 
    // e.g. "Cal,1413" for 1.413 mS/cm
    
    // In a real implementation with actual hardware, we would:
    // 1. Convert mS/cm to μS/cm (multiply by 1000)
    // 2. Send the calibration command to the EZO circuit
    // 3. Wait for response confirming calibration
    
    // For our simulation/frontend, we store the reading and keep voltage for backwards compatibility
    
    // Update the calibration point
    calibrationData.ec.point = { 
      reading: parseFloat(newData.reading), 
      voltage: parseFloat(newData.voltage || 0) 
    };
    
    // Update the calibration timestamp
    calibrationData.ec.lastCalibrated = new Date().toISOString();
    
    // EC is calibrated if we have a valid point
    calibrationData.ec.isCalibrated = calibrationData.ec.point.reading !== 0;
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      data: calibrationData.ec
    });
  } catch (error) {
    console.error('Error updating EC calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to update EC calibration data' },
      { status: 500 }
    );
  }
}

// DELETE handler - reset EC calibration data
export async function DELETE(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    
    // Reset EC calibration data
    calibrationData.ec = {
      point: { reading: 1.413, voltage: 0 },
      lastCalibrated: null,
      isCalibrated: false
    };
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      message: 'EC calibration data reset successfully'
    });
  } catch (error) {
    console.error('Error resetting EC calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to reset EC calibration data' },
      { status: 500 }
    );
  }
} 
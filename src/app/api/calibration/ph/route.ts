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

// GET handler - retrieve pH calibration data
export async function GET(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    return NextResponse.json(calibrationData.ph);
  } catch (error) {
    console.error('Error fetching pH calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pH calibration data' },
      { status: 500 }
    );
  }
}

// POST handler - update pH calibration data with new point
export async function POST(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    const newData = await request.json();
    
    // Validate the data
    if (!newData.point || !newData.reading) {
      return NextResponse.json(
        { error: 'Invalid calibration data. Required: point, reading' },
        { status: 400 }
      );
    }
    
    // Update the appropriate calibration point
    const point = newData.point.toLowerCase();
    
    // For Atlas Scientific EZO pH sensors:
    // - Mid point (pH 7) must be calibrated first
    // - Then low point (pH 4) and/or high point (pH 10)
    
    // Check if trying to calibrate low or high point before mid point
    if ((point === 'low' || point === 'high') && calibrationData.ph.midPoint.voltage === 0) {
      return NextResponse.json(
        { error: 'EZO pH sensors require mid point (pH 7) calibration first' },
        { status: 400 }
      );
    }
    
    if (point === 'low' || point === '4') {
      calibrationData.ph.lowPoint = { 
        reading: parseFloat(newData.reading), 
        voltage: parseFloat(newData.voltage || 0) 
      };
    } else if (point === 'mid' || point === '7') {
      calibrationData.ph.midPoint = { 
        reading: parseFloat(newData.reading), 
        voltage: parseFloat(newData.voltage || 0) 
      };
    } else if (point === 'high' || point === '10') {
      calibrationData.ph.highPoint = { 
        reading: parseFloat(newData.reading), 
        voltage: parseFloat(newData.voltage || 0) 
      };
    } else {
      return NextResponse.json(
        { error: 'Invalid calibration point. Must be "low", "mid", or "high"' },
        { status: 400 }
      );
    }
    
    // Update the calibration timestamp
    calibrationData.ph.lastCalibrated = new Date().toISOString();
    
    // Check if we have enough points to consider the probe calibrated
    // Atlas EZO pH needs at minimum the mid point (pH 7.0) calibration
    // Ideally it should have either low or high point calibrated too
    const hasMid = calibrationData.ph.midPoint.reading !== 0;
    const hasLow = calibrationData.ph.lowPoint.reading !== 0;
    const hasHigh = calibrationData.ph.highPoint.reading !== 0;
    
    calibrationData.ph.isCalibrated = hasMid && (hasLow || hasHigh);
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      data: calibrationData.ph
    });
  } catch (error) {
    console.error('Error updating pH calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to update pH calibration data' },
      { status: 500 }
    );
  }
}

// DELETE handler - reset pH calibration data
export async function DELETE(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    
    // Reset pH calibration data
    calibrationData.ph = {
      lowPoint: { reading: 4.0, voltage: 0 },
      midPoint: { reading: 7.0, voltage: 0 },
      highPoint: { reading: 10.0, voltage: 0 },
      lastCalibrated: null,
      isCalibrated: false
    };
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      message: 'pH calibration data reset successfully'
    });
  } catch (error) {
    console.error('Error resetting pH calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to reset pH calibration data' },
      { status: 500 }
    );
  }
} 
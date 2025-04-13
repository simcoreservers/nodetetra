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

// GET handler - retrieve temperature calibration data
export async function GET(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    return NextResponse.json(calibrationData.temperature);
  } catch (error) {
    console.error('Error fetching temperature calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch temperature calibration data' },
      { status: 500 }
    );
  }
}

// POST handler - update temperature calibration data
export async function POST(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    const newData = await request.json();
    
    // Validate the data
    if (!newData.referenceReading || !newData.sensorReading) {
      return NextResponse.json(
        { error: 'Invalid calibration data. Required: referenceReading, sensorReading' },
        { status: 400 }
      );
    }
    
    // For Atlas Scientific EZO RTD (temperature) sensors, we would send:
    // Cal,<temperature in °C>  
    // e.g. "Cal,25.5" to calibrate to 25.5°C
    
    // Calculate offset (difference between reference and sensor)
    const reference = parseFloat(newData.referenceReading);
    const sensor = parseFloat(newData.sensorReading);
    const offset = reference - sensor;
    
    // Update the temperature calibration data
    calibrationData.temperature = {
      offset: offset,
      referenceReading: reference,
      sensorReading: sensor,
      lastCalibrated: new Date().toISOString(),
      isCalibrated: true
    };
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      data: calibrationData.temperature
    });
  } catch (error) {
    console.error('Error updating temperature calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to update temperature calibration data' },
      { status: 500 }
    );
  }
}

// DELETE handler - reset temperature calibration data
export async function DELETE(request: NextRequest) {
  try {
    const calibrationData = await getCalibrationData();
    
    // Reset temperature calibration data
    calibrationData.temperature = {
      offset: 0,
      referenceReading: 25.0,
      sensorReading: 25.0,
      lastCalibrated: null,
      isCalibrated: false
    };
    
    // Save the updated calibration data
    await saveCalibrationData(calibrationData);
    
    return NextResponse.json({
      success: true,
      message: 'Temperature calibration data reset successfully'
    });
  } catch (error) {
    console.error('Error resetting temperature calibration data:', error);
    return NextResponse.json(
      { error: 'Failed to reset temperature calibration data' },
      { status: 500 }
    );
  }
} 
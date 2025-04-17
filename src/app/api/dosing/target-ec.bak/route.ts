import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Path to the dosing JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');

// POST handler - update EC target range
export async function POST(request: NextRequest) {
  try {
    // Read the current dosing data
    const fileData = await fs.readFile(DOSING_FILE, 'utf8');
    const dosingData = JSON.parse(fileData);
    
    // Get the new EC range from the request
    const { min, max } = await request.json();
    
    // Validate the input
    if (typeof min !== 'number' || typeof max !== 'number' || min >= max) {
      return NextResponse.json(
        { error: 'Invalid EC range values. Min must be less than max.' },
        { status: 400 }
      );
    }
    
    // Update the EC target range
    dosingData.settings.targetEc.min = min;
    dosingData.settings.targetEc.max = max;
    dosingData.settings.timestamp = new Date().toISOString();
    dosingData.timestamp = new Date().toISOString();
    
    // Save the updated data
    await fs.writeFile(DOSING_FILE, JSON.stringify(dosingData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating EC target range:', error);
    return NextResponse.json(
      { error: 'Failed to update EC target range' },
      { status: 500 }
    );
  }
} 
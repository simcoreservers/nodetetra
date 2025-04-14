import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Path to the dosing JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');

// POST handler - update dosing limits
export async function POST(request: NextRequest) {
  try {
    // Read the current dosing data
    const fileData = await fs.readFile(DOSING_FILE, 'utf8');
    const dosingData = JSON.parse(fileData);
    
    // Get the new limits from the request
    const limits = await request.json();
    
    // Validate the input - ensure values are numbers and greater than 0
    const errors = [];
    
    for (const [pumpName, value] of Object.entries(limits)) {
      if (typeof value !== 'number' || value < 0) {
        errors.push(`Invalid value for ${pumpName}: must be a number >= 0`);
      }
    }
    
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }
    
    // Update the dosing limits
    dosingData.settings.dosingLimits = {
      ...dosingData.settings.dosingLimits,
      ...limits
    };
    dosingData.settings.timestamp = new Date().toISOString();
    
    // Save the updated data
    await fs.writeFile(DOSING_FILE, JSON.stringify(dosingData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating dosing limits:', error);
    return NextResponse.json(
      { error: 'Failed to update dosing limits' },
      { status: 500 }
    );
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Path to the dosing JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');

// POST handler - update dosing schedule
export async function POST(request: NextRequest) {
  try {
    // Read the current dosing data
    const fileData = await fs.readFile(DOSING_FILE, 'utf8');
    const dosingData = JSON.parse(fileData);
    
    // Get the new schedule from the request
    const { schedule } = await request.json();
    
    // Validate the input
    const validSchedules = ['Continuous', 'Timed', 'Scheduled'];
    if (!validSchedules.includes(schedule)) {
      return NextResponse.json(
        { error: 'Invalid schedule type. Must be one of: Continuous, Timed, Scheduled' },
        { status: 400 }
      );
    }
    
    // Update the dosing schedule
    dosingData.settings.dosingSchedule = schedule;
    dosingData.settings.timestamp = new Date().toISOString();
    dosingData.timestamp = new Date().toISOString();
    
    // Save the updated data
    await fs.writeFile(DOSING_FILE, JSON.stringify(dosingData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating dosing schedule:', error);
    return NextResponse.json(
      { error: 'Failed to update dosing schedule' },
      { status: 500 }
    );
  }
} 
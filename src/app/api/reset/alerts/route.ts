import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

// Base paths for data storage
const DATA_DIR = path.join(process.cwd(), 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');

/**
 * API route to reset the alerts file
 */
export async function GET() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      await mkdirAsync(DATA_DIR, { recursive: true });
    }

    // Reset alerts file with empty array
    await writeFileAsync(ALERTS_FILE, JSON.stringify([], null, 2));
    
    console.log('Alerts file has been reset successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Alerts file has been reset successfully'
    });
  } catch (error) {
    console.error('Error resetting alerts file:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: `Failed to reset alerts file: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
} 
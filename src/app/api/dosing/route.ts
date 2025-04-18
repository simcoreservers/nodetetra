import { NextRequest, NextResponse } from 'next/server';
import { error, info } from '@/app/lib/logger';

const MODULE = 'api:dosing';

/**
 * GET handler for dosing API
 * Returns information that auto-dosing has been removed
 */
export async function GET() {
  return NextResponse.json({
    status: 'info',
    message: 'Auto-dosing feature has been removed from this system.'
  });
}

/**
 * POST handler for dosing API
 * Returns information that auto-dosing has been removed
 */
export async function POST(req: Request) {
  return NextResponse.json({
    status: 'info',
    message: 'Auto-dosing feature has been removed from this system.'
  });
}

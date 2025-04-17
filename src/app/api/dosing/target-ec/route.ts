// Redirect legacy API endpoint to unified dosing API
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  console.warn('Deprecated /api/dosing/target-ec called - redirecting to unified API');
  return NextResponse.redirect(new URL('/api/dosing/targets', 'http://localhost:3000'));
}

export async function POST(request: NextRequest) {
  console.warn('Deprecated /api/dosing/target-ec called - redirecting to unified API');
  const response = await fetch('/api/dosing/targets', {
    method: 'POST',
    headers: request.headers,
    body: request.body
  });
  return response;
}
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Temporarily suppress certain logs by patching console
const originalConsoleLog = console.log;
console.log = function(...args) {
  // Suppress GET /api/sensors logs
  if (typeof args[0] === 'string' && args[0].includes('GET /api/sensors')) {
    return;
  }
  return originalConsoleLog.apply(console, args);
};

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

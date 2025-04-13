import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Time between auto-dosing checks (in ms)
const AUTO_DOSING_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastAutoDoseCheck = 0;

export async function middleware(request: NextRequest) {
  const now = Date.now();
  
  // Check if it's time for an auto-dosing check
  if (now - lastAutoDoseCheck > AUTO_DOSING_CHECK_INTERVAL) {
    lastAutoDoseCheck = now;
    
    // Trigger the auto-dosing check in the background
    try {
      fetch(`${request.nextUrl.origin}/api/auto-dosing`)
        .then(response => response.json())
        .then(data => {
          console.log('Auto-dosing check triggered:', data);
        })
        .catch(error => {
          console.error('Error triggering auto-dosing check:', error);
        });
    } catch (error) {
      console.error('Failed to trigger auto-dosing check:', error);
    }
  }
  
  // Continue with the request
  return NextResponse.next();
}

// Only run the middleware on these routes
export const config = {
  matcher: [
    '/((?!api/auto-dosing|_next/static|_next/image|favicon.ico).*)',
  ],
}; 
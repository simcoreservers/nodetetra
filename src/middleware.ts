import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Import server initialization to ensure it runs
// This import is only for initialization side effects
// The actual import is eliminated during client-side bundling
if (process.env.NODE_ENV !== 'development' || process.env.NEXT_RUNTIME === 'nodejs') {
  import('./app/lib/server-init');
}

export function middleware(request: NextRequest) {
  // Simple middleware that doesn't modify the response
  // but ensures our server initialization code runs
  return NextResponse.next();
}

// Configure matcher for specific routes only to reduce overhead
export const config = {
  matcher: [
    // Apply only to API routes
    '/api/:path*',
  ],
}; 
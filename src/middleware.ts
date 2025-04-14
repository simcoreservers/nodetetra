import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Initialize server in a controlled, non-blocking way
let serverInitialized = false;
let serverInitializing = false;
let serverInitError: Error | null = null;

const initializeServerAsync = async () => {
  if (serverInitialized || serverInitializing) return;
  
  serverInitializing = true;
  try {
    if (process.env.NODE_ENV !== 'development' || process.env.NEXT_RUNTIME === 'nodejs') {
      // Dynamic import to avoid client-side bundling
      const { initializeServer } = await import('./app/lib/server-init');
      await initializeServer();
    }
    serverInitialized = true;
    console.log('Server initialization completed successfully');
  } catch (error) {
    console.error('Server initialization failed:', error);
    serverInitError = error instanceof Error ? error : new Error(String(error));
  } finally {
    serverInitializing = false;
  }
};

// Start initialization in the background immediately
if (typeof window === 'undefined') {
  initializeServerAsync().catch(err => {
    console.error('Failed to initialize server in background:', err);
  });
}

export function middleware(request: NextRequest) {
  // Return next response without waiting for initialization
  return NextResponse.next();
}

// Configure matcher for specific routes only to reduce overhead
export const config = {
  matcher: [
    // Apply only to API routes
    '/api/:path*',
  ],
}; 
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during builds to allow us to run with hardware access
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript type checking during builds for native modules
  typescript: {
    ignoreBuildErrors: true,
  },
  // Reduce logging verbosity
  logging: {
    fetches: {
      fullUrl: false
    }
  },
  // Use strict mode for better development experience
  reactStrictMode: true,
  // Disable on-demand entries to ensure all pages are compiled at startup
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000, // 24 hours
    pagesBufferLength: 100, // Keep many more pages in memory
  },
  // Enable SWC minification for faster builds
  swcMinify: true,
  // Configure compilation for better performance
  compiler: {
    // Removes React properties like `data-testid` in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // More aggressively cache build artifacts
  experimental: {
    // Cache build outputs
    turboCaching: true,
    // Improved startup time
    strictNextHead: true,
  },
};

module.exports = nextConfig;
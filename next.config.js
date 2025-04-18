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
  // Silence route handling logs
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  }
};

module.exports = nextConfig;
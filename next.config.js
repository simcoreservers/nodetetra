/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during builds to allow us to run with hardware access
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript type checking during builds for native modules
  typescript: {
    ignoreBuildErrors: true,
  }
};

module.exports = nextConfig; 
// Configuration file for application settings

// Development mode settings
const isDev = process.env.NODE_ENV === 'development';

// API refresh intervals (in milliseconds)
export const API_CONFIG = {
  // Set longer intervals (or disable) for development to reduce console noise
  PROFILE_REFRESH_INTERVAL: isDev ? 900000 : 60000, // 15 minutes in dev, 1 minute in prod
  PUMP_REFRESH_INTERVAL: isDev ? 600000 : 30000,    // 10 minutes in dev, 30 seconds in prod
  
  // Disable polling completely in development (set to true to disable all polling)
  DISABLE_POLLING_IN_DEV: false
};

// Export isDev flag for other uses
export const IS_DEV = isDev; 
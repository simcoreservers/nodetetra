// API configuration

const logLevel = process.env.LOG_LEVEL || 'normal'; // normal, verbose, quiet

// Configure API logging
const apiConfig = {
  // Whether to log API requests - set to false to disable the logs you're seeing
  logRequests: logLevel !== 'quiet',
  
  // Only log changes rather than all requests
  logOnlyChanges: logLevel === 'normal',
  
  // Whether to log initialization messages
  logInitialization: logLevel === 'verbose'
};

module.exports = apiConfig; 
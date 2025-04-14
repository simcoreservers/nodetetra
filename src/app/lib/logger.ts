/**
 * Logging utility for NuTetra
 * Provides structured logging with configurable log levels
 */

// Define log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// Global log level setting
let currentLogLevel: LogLevel = LogLevel.INFO;

// Configure log level based on environment or configuration
export function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
  log('system', LogLevel.INFO, `Log level set to ${LogLevel[level]}`);
}

// Get current log level
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

// Get log level name
export function getLogLevelName(level: LogLevel): string {
  return LogLevel[level];
}

// Main logging function
export function log(module: string, level: LogLevel, message: string, data?: any) {
  if (level > currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const logLevelName = LogLevel[level].padEnd(5, ' ');
  const moduleName = module.padEnd(10, ' ');
  
  // Format the message
  let formattedMessage = `[${timestamp}] [${logLevelName}] [${moduleName}] ${message}`;
  
  // Switch based on log level
  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage);
      if (data) console.error(data);
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage);
      if (data) console.warn(data);
      break;
    default:
      console.log(formattedMessage);
      if (data && level <= LogLevel.INFO) {
        // For INFO level and below, just log basic data
        if (typeof data === 'object') {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(data);
        }
      } else if (data) {
        // For DEBUG and TRACE, log detailed data
        console.log(data);
      }
  }
}

// Convenience methods
export function error(module: string, message: string, data?: any) {
  log(module, LogLevel.ERROR, message, data);
}

export function warn(module: string, message: string, data?: any) {
  log(module, LogLevel.WARN, message, data);
}

export function info(module: string, message: string, data?: any) {
  log(module, LogLevel.INFO, message, data);
}

export function debug(module: string, message: string, data?: any) {
  log(module, LogLevel.DEBUG, message, data);
}

export function trace(module: string, message: string, data?: any) {
  log(module, LogLevel.TRACE, message, data);
} 
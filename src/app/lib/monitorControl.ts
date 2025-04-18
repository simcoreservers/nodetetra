/**
 * Monitoring control module - manages auto-dosing monitoring state
 */

import { warn, info } from './logger';

// Global flag to control monitoring status
let monitoringEnabled = false;

// Function to get monitoring status
export function isMonitoringEnabled(): boolean {
  return monitoringEnabled;
}

// Function to enable monitoring
export function enableMonitoring(): void {
  monitoringEnabled = true;
  info('monitorControl', '!!! MONITORING ENABLED !!!');
}

// Function to disable monitoring
export function disableMonitoring(): void {
  monitoringEnabled = false;
  info('monitorControl', '!!! MONITORING DISABLED !!!');
}

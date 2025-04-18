/**
 * Unified monitoring & auto-dosing control module
 * This module uses the auto-dosing config's enabled state as the single source of truth
 */

import { warn, info, error } from './logger';
import { updateDosingConfig, getDosingConfig } from './autoDosing';

const MODULE = 'monitorControl';

/**
 * Check if auto-dosing and monitoring is enabled
 * This is the single source of truth for the system status
 */
export function isMonitoringEnabled(): boolean {
  try {
    const config = getDosingConfig();
    return !!config.enabled;
  } catch (err) {
    error(MODULE, 'Error checking if auto-dosing is enabled:', err);
    return false; // Default to disabled for safety
  }
}

/**
 * Enable the auto-dosing system
 * This is the single unified function to enable both monitoring and dosing
 */
export async function enableMonitoring(): Promise<void> {
  try {
    info(MODULE, '!!! ENABLING AUTO-DOSING SYSTEM !!!');
    updateDosingConfig({ enabled: true });
    info(MODULE, 'Auto-dosing system is now ENABLED');
  } catch (err) {
    error(MODULE, 'Error enabling auto-dosing system:', err);
  }
}

/**
 * Disable the auto-dosing system
 * This is the single unified function to disable both monitoring and dosing
 */
export async function disableMonitoring(): Promise<void> {
  try {
    info(MODULE, '!!! DISABLING AUTO-DOSING SYSTEM !!!');
    updateDosingConfig({ enabled: false });
    info(MODULE, 'Auto-dosing system is now DISABLED');
  } catch (err) {
    error(MODULE, 'Error disabling auto-dosing system:', err);
  }
}

/**
 * For backward compatibility only
 * Ensures any code calling this function works with the unified system
 */
export function syncMonitoringWithAutoDosing(): void {
  // No-op function as we now use a single source of truth
  // This function is kept for backward compatibility
  info(MODULE, 'Using unified auto-dosing state - no sync needed');
}

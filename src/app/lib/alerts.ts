/**
 * NuTetra Alert System
 * Manages alerts, thresholds, and notification settings
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { SensorData } from './sensors';

const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);

// Define alert types
export type AlertType = 'pH' | 'EC' | 'Temperature' | 'System' | 'Pump';
export type AlertLevel = 'Critical' | 'Warning' | 'Info';

// Define threshold settings
export interface ThresholdSettings {
  ph: {
    min: number;
    max: number;
    criticalMin: number;
    criticalMax: number;
  };
  ec: {
    min: number;
    max: number;
    criticalMin: number;
    criticalMax: number;
  };
  temp: {
    min: number;
    max: number;
    criticalMin: number;
    criticalMax: number;
  };
}

// Define alert settings
export interface AlertSettings {
  email: string;
  smsNumber: string;
  notifyOnCritical: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
  dailySummary: boolean;
}

// Define alert interface
export interface Alert {
  id: number;
  type: AlertType;
  level: AlertLevel;
  message: string;
  timestamp: string;
  created: Date;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: Date;
}

// Base paths for data storage
const DATA_DIR = path.join(process.cwd(), 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'alertSettings.json');
const THRESHOLDS_FILE = path.join(DATA_DIR, 'thresholds.json');

// Default values
const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  email: "",
  smsNumber: "",
  notifyOnCritical: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
  dailySummary: true,
};

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  ph: {
    min: 5.5,
    max: 6.5,
    criticalMin: 5.0,
    criticalMax: 7.0,
  },
  ec: {
    min: 1.0,
    max: 1.8,
    criticalMin: 0.8,
    criticalMax: 2.0,
  },
  temp: {
    min: 18,
    max: 26,
    criticalMin: 15,
    criticalMax: 30,
  },
};

// In-memory alert cache
let alerts: Alert[] = [];
let nextAlertId = 1;

/**
 * Initialize the alert system
 */
export async function initializeAlertSystem(): Promise<void> {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      await mkdirAsync(DATA_DIR, { recursive: true });
    }

    // Initialize alert settings if they don't exist
    if (!fs.existsSync(SETTINGS_FILE)) {
      await writeFileAsync(SETTINGS_FILE, JSON.stringify(DEFAULT_ALERT_SETTINGS, null, 2));
    }

    // Initialize threshold settings if they don't exist
    if (!fs.existsSync(THRESHOLDS_FILE)) {
      await writeFileAsync(THRESHOLDS_FILE, JSON.stringify(DEFAULT_THRESHOLDS, null, 2));
    }

    // Initialize alerts file if it doesn't exist
    if (!fs.existsSync(ALERTS_FILE)) {
      await writeFileAsync(ALERTS_FILE, JSON.stringify([], null, 2));
    } else {
      // Load existing alerts into memory
      const alertsData = await readFileAsync(ALERTS_FILE, 'utf8');
      alerts = JSON.parse(alertsData);
      
      // Find the highest ID to set nextAlertId
      if (alerts.length > 0) {
        const maxId = Math.max(...alerts.map(alert => alert.id));
        nextAlertId = maxId + 1;
      }
    }

    console.log('Alert system initialized successfully');
  } catch (error) {
    console.error('Error initializing alert system:', error);
    throw error;
  }
}

/**
 * Get alert settings
 */
export async function getAlertSettings(): Promise<AlertSettings> {
  try {
    const data = await readFileAsync(SETTINGS_FILE, 'utf8');
    return JSON.parse(data) as AlertSettings;
  } catch (error) {
    console.error('Error reading alert settings:', error);
    return DEFAULT_ALERT_SETTINGS;
  }
}

/**
 * Update alert settings
 */
export async function updateAlertSettings(settings: Partial<AlertSettings>): Promise<AlertSettings> {
  try {
    // Read current settings
    const currentSettings = await getAlertSettings();
    
    // Update with new values
    const updatedSettings = { ...currentSettings, ...settings };
    
    // Save updated settings
    await writeFileAsync(SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2));
    
    return updatedSettings;
  } catch (error) {
    console.error('Error updating alert settings:', error);
    throw new Error(`Failed to update alert settings: ${error}`);
  }
}

/**
 * Get threshold settings
 */
export async function getThresholdSettings(): Promise<ThresholdSettings> {
  try {
    const data = await readFileAsync(THRESHOLDS_FILE, 'utf8');
    return JSON.parse(data) as ThresholdSettings;
  } catch (error) {
    console.error('Error reading threshold settings:', error);
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Update threshold settings
 */
export async function updateThresholdSettings(
  settings: Partial<ThresholdSettings>
): Promise<ThresholdSettings> {
  try {
    // Read current settings
    const currentSettings = await getThresholdSettings();
    
    // Deep merge the objects
    const updatedSettings = {
      ph: { ...currentSettings.ph, ...(settings.ph || {}) },
      ec: { ...currentSettings.ec, ...(settings.ec || {}) },
      temp: { ...currentSettings.temp, ...(settings.temp || {}) },
    };
    
    // Save updated settings
    await writeFileAsync(THRESHOLDS_FILE, JSON.stringify(updatedSettings, null, 2));
    
    return updatedSettings;
  } catch (error) {
    console.error('Error updating threshold settings:', error);
    throw new Error(`Failed to update threshold settings: ${error}`);
  }
}

/**
 * Add a new alert
 */
export async function addAlert(
  type: AlertType,
  level: AlertLevel,
  message: string
): Promise<Alert> {
  const now = new Date();
  
  const newAlert: Alert = {
    id: nextAlertId++,
    type,
    level,
    message,
    timestamp: now.toISOString(),
    created: now,
    acknowledged: false,
    resolved: false,
  };
  
  alerts.push(newAlert);
  
  // Persist to disk
  try {
    await writeFileAsync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Error saving alert:', error);
  }
  
  // Attempt to send notification based on settings
  try {
    await sendAlertNotification(newAlert);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
  
  return newAlert;
}

/**
 * Get all alerts, optionally filtered
 */
export async function getAlerts(options: {
  activeOnly?: boolean;
  resolvedOnly?: boolean;
  limit?: number;
} = {}): Promise<Alert[]> {
  let filteredAlerts = [...alerts];
  
  if (options.activeOnly) {
    filteredAlerts = filteredAlerts.filter(alert => !alert.resolved);
  }
  
  if (options.resolvedOnly) {
    filteredAlerts = filteredAlerts.filter(alert => alert.resolved);
  }
  
  // Sort by timestamp descending (newest first)
  filteredAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  if (options.limit) {
    filteredAlerts = filteredAlerts.slice(0, options.limit);
  }
  
  return filteredAlerts;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: number): Promise<Alert | null> {
  const alertIndex = alerts.findIndex(alert => alert.id === alertId);
  
  if (alertIndex === -1) {
    return null;
  }
  
  alerts[alertIndex].acknowledged = true;
  
  // Persist to disk
  try {
    await writeFileAsync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Error saving alert acknowledgement:', error);
  }
  
  return alerts[alertIndex];
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: number): Promise<Alert | null> {
  const alertIndex = alerts.findIndex(alert => alert.id === alertId);
  
  if (alertIndex === -1) {
    return null;
  }
  
  alerts[alertIndex].resolved = true;
  alerts[alertIndex].resolvedAt = new Date();
  
  // Persist to disk
  try {
    await writeFileAsync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Error saving alert resolution:', error);
  }
  
  return alerts[alertIndex];
}

/**
 * Check sensor data against thresholds and generate alerts if needed
 */
export async function checkSensorDataForAlerts(data: SensorData): Promise<Alert[]> {
  const thresholds = await getThresholdSettings();
  const generatedAlerts: Alert[] = [];
  
  // Check pH
  if (data.ph < thresholds.ph.criticalMin) {
    const alert = await addAlert('pH', 'Critical', `pH level critically low: ${data.ph.toFixed(2)}`);
    generatedAlerts.push(alert);
  } else if (data.ph > thresholds.ph.criticalMax) {
    const alert = await addAlert('pH', 'Critical', `pH level critically high: ${data.ph.toFixed(2)}`);
    generatedAlerts.push(alert);
  } else if (data.ph < thresholds.ph.min) {
    const alert = await addAlert('pH', 'Warning', `pH level below target range: ${data.ph.toFixed(2)}`);
    generatedAlerts.push(alert);
  } else if (data.ph > thresholds.ph.max) {
    const alert = await addAlert('pH', 'Warning', `pH level above target range: ${data.ph.toFixed(2)}`);
    generatedAlerts.push(alert);
  }
  
  // Check EC
  if (data.ec < thresholds.ec.criticalMin) {
    const alert = await addAlert('EC', 'Critical', `EC level critically low: ${data.ec.toFixed(2)} mS/cm`);
    generatedAlerts.push(alert);
  } else if (data.ec > thresholds.ec.criticalMax) {
    const alert = await addAlert('EC', 'Critical', `EC level critically high: ${data.ec.toFixed(2)} mS/cm`);
    generatedAlerts.push(alert);
  } else if (data.ec < thresholds.ec.min) {
    const alert = await addAlert('EC', 'Warning', `EC level below target range: ${data.ec.toFixed(2)} mS/cm`);
    generatedAlerts.push(alert);
  } else if (data.ec > thresholds.ec.max) {
    const alert = await addAlert('EC', 'Warning', `EC level above target range: ${data.ec.toFixed(2)} mS/cm`);
    generatedAlerts.push(alert);
  }
  
  // Check Temperature
  if (data.waterTemp < thresholds.temp.criticalMin) {
    const alert = await addAlert('Temperature', 'Critical', `Water temperature critically low: ${data.waterTemp.toFixed(1)}°C`);
    generatedAlerts.push(alert);
  } else if (data.waterTemp > thresholds.temp.criticalMax) {
    const alert = await addAlert('Temperature', 'Critical', `Water temperature critically high: ${data.waterTemp.toFixed(1)}°C`);
    generatedAlerts.push(alert);
  } else if (data.waterTemp < thresholds.temp.min) {
    const alert = await addAlert('Temperature', 'Warning', `Water temperature below target range: ${data.waterTemp.toFixed(1)}°C`);
    generatedAlerts.push(alert);
  } else if (data.waterTemp > thresholds.temp.max) {
    const alert = await addAlert('Temperature', 'Warning', `Water temperature above target range: ${data.waterTemp.toFixed(1)}°C`);
    generatedAlerts.push(alert);
  }
  
  return generatedAlerts;
}

/**
 * Send alert notification (placeholder - replace with actual email/SMS sending)
 * This would be connected to an email API or SMS gateway in a real implementation
 */
async function sendAlertNotification(alert: Alert): Promise<void> {
  try {
    const settings = await getAlertSettings();
    
    // Skip sending if notifications are disabled for this alert level
    if (
      (alert.level === 'Critical' && !settings.notifyOnCritical) ||
      (alert.level === 'Warning' && !settings.notifyOnWarning) ||
      (alert.level === 'Info' && !settings.notifyOnInfo)
    ) {
      return;
    }
    
    // Log the notification (in a real implementation, this would send emails or SMS)
    console.log(`[NOTIFICATION] ${alert.level} ${alert.type} Alert: ${alert.message}`);
    console.log(`Would send to email: ${settings.email}`);
    if (settings.smsNumber && alert.level === 'Critical') {
      console.log(`Would send to SMS: ${settings.smsNumber}`);
    }
    
    // In a real implementation, you would use a service like SendGrid, Twilio, etc.
    // For example:
    /*
    await sendEmail({
      to: settings.email,
      subject: `NuTetra ${alert.level} Alert: ${alert.type}`,
      text: alert.message,
    });
    */
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
} 
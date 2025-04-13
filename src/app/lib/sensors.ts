/**
 * NuTetra Sensor API for Atlas Scientific EZO Circuits
 * Handles communication with Atlas Scientific pH, EC, and temperature sensors via I2C
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// I2C addresses for Atlas Scientific EZO circuits
const I2C_ADDRESSES = {
  pH: 0x63,      // Default address for EZO pH Circuit
  EC: 0x64,      // Default address for EZO EC Circuit
  RTD: 0x66,     // Default address for EZO RTD Temperature Circuit
};

// Commands for the EZO circuits
const EZO_COMMANDS = {
  READ: 'R',
  CALIBRATE: 'Cal',
  SLEEP: 'Sleep',
  INFO: 'I',
  STATUS: 'Status',
  LED_ON: 'L,1',
  LED_OFF: 'L,0',
  TEMPERATURE_COMPENSATION: 'T,',
};

// Custom error classes for specific sensor issues
export class SensorConnectionError extends Error {
  constructor(sensorType: string, address: number, message: string) {
    super(`${sensorType} sensor (address: 0x${address.toString(16)}) connection error: ${message}`);
    this.name = "SensorConnectionError";
  }
}

export class SensorReadingError extends Error {
  constructor(sensorType: string, message: string) {
    super(`${sensorType} sensor reading error: ${message}`);
    this.name = "SensorReadingError";
  }
}

export class SensorCalibrationError extends Error {
  constructor(sensorType: string, message: string) {
    super(`${sensorType} sensor calibration error: ${message}`);
    this.name = "SensorCalibrationError";
  }
}

/**
 * Send command to an Atlas Scientific EZO circuit via I2C
 * @param address - I2C address of the EZO circuit
 * @param command - Command to send
 * @returns Promise resolving to the response
 */
async function sendCommand(address: number, command: string, sensorType: string): Promise<string> {
  try {
    // Construct i2c-tools command (i2cset to write, i2cget to read)
    const writeCmd = `i2cset -y 1 ${address} "${command}" i`;
    
    try {
      await execAsync(writeCmd);
    } catch (error) {
      throw new SensorConnectionError(sensorType, address, 
        `Failed to write command to sensor. Check I2C connectivity and sensor power. Error: ${error}`);
    }
    
    // Wait for the sensor to process the command
    await new Promise(resolve => setTimeout(resolve, 900));
    
    // Read the response
    const readCmd = `i2cget -y 1 ${address}`;
    
    try {
      const { stdout } = await execAsync(readCmd);
      const response = stdout.trim();
      
      if (!response) {
        throw new SensorReadingError(sensorType, "Received empty response from sensor");
      }
      
      return response;
    } catch (error) {
      throw new SensorConnectionError(sensorType, address, 
        `Failed to read from sensor. Check I2C connectivity and sensor power. Error: ${error}`);
    }
  } catch (error) {
    if (error instanceof SensorConnectionError || error instanceof SensorReadingError) {
      throw error;
    }
    
    console.error(`Error communicating with ${sensorType} sensor at address ${address}: ${error}`);
    throw new SensorConnectionError(sensorType, address, `Unexpected error: ${error}`);
  }
}

/**
 * Get current pH reading from the EZO pH circuit
 * @returns Promise resolving to pH value
 */
export async function getPHReading(): Promise<number> {
  try {
    const response = await sendCommand(I2C_ADDRESSES.pH, EZO_COMMANDS.READ, "pH");
    const phValue = parseFloat(response);
    
    if (isNaN(phValue)) {
      throw new SensorReadingError("pH", "Sensor returned a non-numeric value");
    }
    
    if (phValue < 0 || phValue > 14) {
      throw new SensorReadingError("pH", `pH value out of range (0-14): ${phValue}`);
    }
    
    return phValue;
  } catch (error) {
    console.error('Error getting pH reading:', error);
    throw error;
  }
}

/**
 * Get current EC (electrical conductivity) reading from the EZO EC circuit
 * @returns Promise resolving to EC value in mS/cm
 */
export async function getECReading(): Promise<number> {
  try {
    const response = await sendCommand(I2C_ADDRESSES.EC, EZO_COMMANDS.READ, "EC");
    const ecValue = parseFloat(response);
    
    if (isNaN(ecValue)) {
      throw new SensorReadingError("EC", "Sensor returned a non-numeric value");
    }
    
    if (ecValue < 0 || ecValue > 100) { // Realistic EC range for hydroponics
      throw new SensorReadingError("EC", `EC value out of range (0-100 mS/cm): ${ecValue}`);
    }
    
    return ecValue;
  } catch (error) {
    console.error('Error getting EC reading:', error);
    throw error;
  }
}

/**
 * Get current temperature reading from the EZO RTD circuit
 * @returns Promise resolving to temperature value in Celsius
 */
export async function getTemperatureReading(): Promise<number> {
  try {
    const response = await sendCommand(I2C_ADDRESSES.RTD, EZO_COMMANDS.READ, "Temperature");
    const tempValue = parseFloat(response);
    
    if (isNaN(tempValue)) {
      throw new SensorReadingError("Temperature", "Sensor returned a non-numeric value");
    }
    
    if (tempValue < -10 || tempValue > 85) { // Realistic temperature range
      throw new SensorReadingError("Temperature", `Temperature value out of reasonable range (-10 to 85°C): ${tempValue}`);
    }
    
    return tempValue;
  } catch (error) {
    console.error('Error getting temperature reading:', error);
    throw error;
  }
}

/**
 * Set temperature compensation for pH and EC sensors
 * @param temperature - Current temperature in Celsius
 */
export async function setTemperatureCompensation(temperature: number): Promise<void> {
  try {
    // Validate temperature
    if (temperature < -10 || temperature > 85) {
      throw new Error(`Temperature for compensation is out of range (-10 to 85°C): ${temperature}`);
    }
    
    // Set temperature compensation for pH sensor
    await sendCommand(
      I2C_ADDRESSES.pH, 
      `${EZO_COMMANDS.TEMPERATURE_COMPENSATION}${temperature}`,
      "pH"
    );
    
    // Set temperature compensation for EC sensor
    await sendCommand(
      I2C_ADDRESSES.EC, 
      `${EZO_COMMANDS.TEMPERATURE_COMPENSATION}${temperature}`,
      "EC"
    );
  } catch (error) {
    console.error('Error setting temperature compensation:', error);
    throw error;
  }
}

/**
 * Get all sensor readings at once
 * @returns Promise resolving to an object containing pH, EC, and temperature values
 */
export async function getAllSensorReadings(): Promise<{
  ph: number;
  ec: number;
  waterTemp: number;
}> {
  // Get temperature first
  let waterTemp: number;
  try {
    waterTemp = await getTemperatureReading();
  } catch (error) {
    console.error('Failed to get temperature reading:', error);
    throw error;
  }

  try {
    // Set temperature compensation for both pH and EC sensors
    await setTemperatureCompensation(waterTemp);
  } catch (error) {
    console.error('Failed to set temperature compensation:', error);
    // Continue with readings even if compensation fails
  }
  
  // Get pH and EC readings in parallel for efficiency
  try {
    const [ph, ec] = await Promise.all([
      getPHReading(),
      getECReading()
    ]);
    
    return { ph, ec, waterTemp };
  } catch (error) {
    console.error('Error getting sensor readings:', error);
    throw error;
  }
}

/**
 * Calibrate the pH sensor
 * @param point - Calibration point (4, 7, or 10)
 */
export async function calibratePH(point: 4 | 7 | 10): Promise<void> {
  try {
    await sendCommand(I2C_ADDRESSES.pH, `${EZO_COMMANDS.CALIBRATE},${point}`, "pH");
  } catch (error) {
    throw new SensorCalibrationError("pH", `Failed to calibrate at point ${point}: ${error}`);
  }
}

/**
 * Calibrate the EC sensor
 * @param value - Calibration solution value in μS/cm
 */
export async function calibrateEC(value: number): Promise<void> {
  try {
    await sendCommand(I2C_ADDRESSES.EC, `${EZO_COMMANDS.CALIBRATE},${value}`, "EC");
  } catch (error) {
    throw new SensorCalibrationError("EC", `Failed to calibrate with solution ${value} μS/cm: ${error}`);
  }
}

export interface SensorData {
  ph: number;
  ec: number;
  waterTemp: number;
  timestamp: string;
} 
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { SensorData } from '@/app/lib/sensors';
import { getSimulatedSensorReadings, isSimulationEnabled, initializeSimulation } from '@/app/lib/simulation';
import { DosingData } from '@/app/hooks/useDosingData';
import { dispensePump, PumpName } from '@/app/lib/pumps';

// Initialize simulation system
initializeSimulation()
  .then(() => console.log('Simulation system initialized'))
  .catch(err => console.error('Error initializing simulation:', err));

// Path to the dosing JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');

// Dosage amounts (ml) and flow rates (ml/s) for different adjustments
const DOSAGE_CONFIG = {
  phUp: { amount: 2, flowRate: 1.0 },
  phDown: { amount: 2, flowRate: 1.0 },
  nutrientA: { amount: 5, flowRate: 1.0 },
  nutrientB: { amount: 5, flowRate: 1.0 },
};

// Interval time in ms for the auto-dosing check
const AUTO_DOSING_INTERVAL = 60000; // 1 minute
let lastAutoCheck = 0;

// Cooling off period (in ms) between doses for the same parameter
const COOLING_PERIOD = 1800000; // 30 minutes
const lastDoses: Record<string, number> = {
  phUp: 0,
  phDown: 0,
  nutrientA: 0,
  nutrientB: 0,
};

// Helper to read dosing data from file
async function getDosingData(): Promise<DosingData> {
  try {
    // Ensure data directory exists
    try {
      await fs.access(DATA_PATH);
    } catch (error) {
      await fs.mkdir(DATA_PATH, { recursive: true });
    }
    
    const fileData = await fs.readFile(DOSING_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (error) {
    // If file doesn't exist or has invalid JSON, return default data
    return {
      settings: {
        targetPh: {
          min: 5.8,
          max: 6.2,
          current: 6.0
        },
        targetEc: {
          min: 1.2,
          max: 1.5,
          current: 1.35
        },
        dosingSchedule: "Auto",
        dosingLimits: {
          phUp: 50,
          phDown: 50,
          nutrientA: 100,
          nutrientB: 100
        },
        timestamp: new Date().toISOString()
      },
      history: []
    };
  }
}

// Helper to save dosing data
async function saveDosingData(data: DosingData): Promise<void> {
  // Ensure data directory exists
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(DATA_PATH, { recursive: true });
  }
  
  await fs.writeFile(DOSING_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Add entry to dosing history
async function addDosingHistoryEntry(pump: string, action: string): Promise<void> {
  const dosingData = await getDosingData();
  
  const newEntry = {
    id: dosingData.history.length + 1,
    time: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    pump,
    action
  };
  
  dosingData.history.unshift(newEntry);
  
  // Limit history to 100 entries
  if (dosingData.history.length > 100) {
    dosingData.history = dosingData.history.slice(0, 100);
  }
  
  await saveDosingData(dosingData);
}

// Get current sensor readings
async function getSensorReadings(): Promise<SensorData> {
  // Check if simulation mode is enabled
  const simulationEnabled = await isSimulationEnabled();
  
  if (simulationEnabled) {
    // Get simulated readings
    return await getSimulatedSensorReadings();
  } else {
    // In a real implementation, this would get readings from actual sensors
    // For now, we'll throw an error that will be caught and handled
    throw new Error("Real sensor readings not implemented");
  }
}

// Process auto-dosing based on sensor readings
async function processAutoDosing(): Promise<{
  dosingActions: string[],
  sensorReadings: SensorData,
  isAutoEnabled: boolean
}> {
  const dosingData = await getDosingData();
  const dosingActions: string[] = [];
  
  // Check if auto-dosing is enabled
  if (dosingData.settings.dosingSchedule !== 'Auto') {
    return { 
      dosingActions: ["Auto-dosing is not enabled"],
      sensorReadings: {
        ph: dosingData.settings.targetPh.current,
        ec: dosingData.settings.targetEc.current,
        waterTemp: 22.0,
        timestamp: new Date().toISOString()
      },
      isAutoEnabled: false
    };
  }
  
  try {
    // Get current sensor readings
    const sensorReadings = await getSensorReadings();
    const now = Date.now();
    
    // Update current values in dosing data
    dosingData.settings.targetPh.current = sensorReadings.ph;
    dosingData.settings.targetEc.current = sensorReadings.ec;
    await saveDosingData(dosingData);
    
    // Check pH and dose if needed
    if (sensorReadings.ph < dosingData.settings.targetPh.min) {
      // pH is too low, need to add pH Up
      if (now - lastDoses.phUp > COOLING_PERIOD) {
        try {
          await dispensePump('pH Up' as PumpName, DOSAGE_CONFIG.phUp.amount, DOSAGE_CONFIG.phUp.flowRate);
          await addDosingHistoryEntry('pH Up', `pH adjusted from ${sensorReadings.ph.toFixed(2)} (below target range)`);
          dosingActions.push(`Dispensed pH Up: ${DOSAGE_CONFIG.phUp.amount}ml`);
          lastDoses.phUp = now;
        } catch (error) {
          dosingActions.push(`Failed to dispense pH Up: ${error}`);
        }
      } else {
        dosingActions.push(`pH is low but in cooling period for pH Up`);
      }
    } else if (sensorReadings.ph > dosingData.settings.targetPh.max) {
      // pH is too high, need to add pH Down
      if (now - lastDoses.phDown > COOLING_PERIOD) {
        try {
          await dispensePump('pH Down' as PumpName, DOSAGE_CONFIG.phDown.amount, DOSAGE_CONFIG.phDown.flowRate);
          await addDosingHistoryEntry('pH Down', `pH adjusted from ${sensorReadings.ph.toFixed(2)} (above target range)`);
          dosingActions.push(`Dispensed pH Down: ${DOSAGE_CONFIG.phDown.amount}ml`);
          lastDoses.phDown = now;
        } catch (error) {
          dosingActions.push(`Failed to dispense pH Down: ${error}`);
        }
      } else {
        dosingActions.push(`pH is high but in cooling period for pH Down`);
      }
    } else {
      dosingActions.push(`pH is within target range: ${sensorReadings.ph.toFixed(2)}`);
    }
    
    // Check EC and dose if needed
    if (sensorReadings.ec < dosingData.settings.targetEc.min) {
      // EC is too low, need to add nutrients
      if (now - lastDoses.nutrientA > COOLING_PERIOD && now - lastDoses.nutrientB > COOLING_PERIOD) {
        try {
          // Add Nutrient A
          await dispensePump('Pump 1' as PumpName, DOSAGE_CONFIG.nutrientA.amount, DOSAGE_CONFIG.nutrientA.flowRate);
          await addDosingHistoryEntry('Nutrient A', `EC adjusted from ${sensorReadings.ec.toFixed(2)} (below target range)`);
          dosingActions.push(`Dispensed Nutrient A: ${DOSAGE_CONFIG.nutrientA.amount}ml`);
          lastDoses.nutrientA = now;
          
          // Add Nutrient B
          await dispensePump('Pump 2' as PumpName, DOSAGE_CONFIG.nutrientB.amount, DOSAGE_CONFIG.nutrientB.flowRate);
          await addDosingHistoryEntry('Nutrient B', `EC adjusted from ${sensorReadings.ec.toFixed(2)} (below target range)`);
          dosingActions.push(`Dispensed Nutrient B: ${DOSAGE_CONFIG.nutrientB.amount}ml`);
          lastDoses.nutrientB = now;
        } catch (error) {
          dosingActions.push(`Failed to dispense nutrients: ${error}`);
        }
      } else {
        dosingActions.push(`EC is low but in cooling period for nutrients`);
      }
    } else {
      dosingActions.push(`EC is within or above target range: ${sensorReadings.ec.toFixed(2)}`);
    }
    
    return { dosingActions, sensorReadings, isAutoEnabled: true };
  } catch (error) {
    return { 
      dosingActions: [`Error: ${error instanceof Error ? error.message : String(error)}`],
      sensorReadings: {
        ph: dosingData.settings.targetPh.current,
        ec: dosingData.settings.targetEc.current,
        waterTemp: 22.0,
        timestamp: new Date().toISOString()
      },
      isAutoEnabled: true
    };
  }
}

// GET handler - manually trigger the auto-dosing check
export async function GET(request: NextRequest) {
  try {
    console.log('Auto-dosing API called');
    const now = Date.now();
    
    // Only run auto-dosing check if it's been at least AUTO_DOSING_INTERVAL since the last check
    if (now - lastAutoCheck < AUTO_DOSING_INTERVAL) {
      const remainingTime = Math.ceil((AUTO_DOSING_INTERVAL - (now - lastAutoCheck)) / 1000);
      
      return NextResponse.json({
        message: `Auto-dosing check was run recently. Next check available in ${remainingTime} seconds.`,
        lastCheck: new Date(lastAutoCheck).toISOString(),
        nextCheck: new Date(lastAutoCheck + AUTO_DOSING_INTERVAL).toISOString(),
        timestamp: new Date().toISOString()
      });
    }
    
    lastAutoCheck = now;
    
    try {
      const result = await processAutoDosing();
      
      return NextResponse.json({
        message: "Auto-dosing check completed",
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (processingError) {
      console.error('Error during auto-dosing processing:', processingError);
      
      return NextResponse.json({
        error: `Auto-dosing processing failed: ${processingError instanceof Error ? processingError.message : String(processingError)}`,
        dosingActions: ["Error: Failed to process auto-dosing check"],
        sensorReadings: null,
        isAutoEnabled: false,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in auto-dosing system:', error);
    
    return NextResponse.json({
      error: `Auto-dosing check failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
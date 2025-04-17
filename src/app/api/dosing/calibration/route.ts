import { NextRequest, NextResponse } from 'next/server';
import { dispensePump, PumpName } from '@/app/lib/pumps';
import { getUnifiedDosingConfig, saveUnifiedDosingConfig } from '@/app/lib/dosingMigration';
import { error, info } from '@/app/lib/logger';

const MODULE = 'api:dosing:calibration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pumpName, flowRate } = body;
    
    if (!pumpName) {
      return NextResponse.json({ status: 'error', error: 'Missing pumpName' }, { status: 400 });
    }
    
    if (typeof flowRate !== 'number' || flowRate <= 0) {
      return NextResponse.json({ status: 'error', error: 'flowRate must be a positive number' }, { status: 400 });
    }
    
    // Get config
    const config = await getUnifiedDosingConfig();
    if (!config) {
      return NextResponse.json({ status: 'error', error: 'Failed to load config' }, { status: 500 });
    }
    
    // Update pump calibration
    if (!config.pumps[pumpName]) {
      config.pumps[pumpName] = {
        flowRate, 
        doseAmount: 0.5,
        minInterval: 120,
        limits: 50
      };
    } else {
      config.pumps[pumpName].flowRate = flowRate;
    }
    
    await saveUnifiedDosingConfig(config);
    
    info(MODULE, `Calibrated ${pumpName} with flow rate ${flowRate}ml/s`);
    
    return NextResponse.json({
      status: 'success',
      pumpName,
      flowRate
    });
  } catch (err) {
    error(MODULE, 'Error calibrating pump:', err);
    return NextResponse.json({ status: 'error', error: 'Failed to calibrate pump' }, { status: 500 });
  }
}

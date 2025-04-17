import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedDosingConfig, saveUnifiedDosingConfig } from '@/app/lib/dosingMigration';
import { error, info } from '@/app/lib/logger';

const MODULE = 'api:dosing:targets';

/**
 * GET handler - get pH and EC targets
 */
export async function GET() {
  try {
    const config = await getUnifiedDosingConfig();
    
    if (!config) {
      return NextResponse.json({
        status: 'error',
        error: 'Failed to load dosing configuration'
      }, { status: 500 });
    }
    
    return NextResponse.json({
      status: 'success',
      targets: config.targets
    });
  } catch (err) {
    error(MODULE, 'Error getting targets:', err);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get targets'
    }, { status: 500 });
  }
}

/**
 * POST handler - update pH and EC targets
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ph, ec } = body;
    
    // Validate inputs
    const errors = [];
    
    if (ph) {
      if (typeof ph.min !== 'number' || typeof ph.max !== 'number' || 
          ph.min < 0 || ph.min > 14 || ph.max < 0 || ph.max > 14 || ph.min >= ph.max) {
        errors.push('Invalid pH range: min must be less than max, and values must be between 0 and 14');
      }
      
      if (typeof ph.target !== 'number' || ph.target < ph.min || ph.target > ph.max) {
        errors.push('Invalid pH target: must be a number within the min/max range');
      }
    }
    
    if (ec) {
      if (typeof ec.min !== 'number' || typeof ec.max !== 'number' || 
          ec.min < 0 || ec.max < 0 || ec.min >= ec.max) {
        errors.push('Invalid EC range: min must be less than max, and values must be non-negative');
      }
      
      if (typeof ec.target !== 'number' || ec.target < ec.min || ec.target > ec.max) {
        errors.push('Invalid EC target: must be a number within the min/max range');
      }
    }
    
    if (errors.length > 0) {
      return NextResponse.json({
        status: 'error',
        errors
      }, { status: 400 });
    }
    
    // Get current config
    const config = await getUnifiedDosingConfig();
    
    if (!config) {
      return NextResponse.json({
        status: 'error',
        error: 'Failed to load dosing configuration'
      }, { status: 500 });
    }
    
    // Update targets
    let modified = false;
    
    if (ph) {
      config.targets.ph = {
        ...config.targets.ph,
        min: ph.min,
        max: ph.max,
        target: ph.target,
        tolerance: (ph.max - ph.min) / 2
      };
      modified = true;
    }
    
    if (ec) {
      config.targets.ec = {
        ...config.targets.ec,
        min: ec.min,
        max: ec.max,
        target: ec.target,
        tolerance: (ec.max - ec.min) / 2
      };
      modified = true;
    }
    
    if (modified) {
      // Save updated config
      const result = await saveUnifiedDosingConfig(config);
      
      if (!result) {
        return NextResponse.json({
          status: 'error',
          error: 'Failed to save updated targets'
        }, { status: 500 });
      }
      
      info(MODULE, 'Updated dosing targets');
    }
    
    return NextResponse.json({
      status: 'success',
      targets: config.targets
    });
  } catch (err) {
    error(MODULE, 'Error updating targets:', err);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to update targets'
    }, { status: 500 });
  }
}

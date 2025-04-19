import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { error, info, debug, warn } from '@/app/lib/logger';

const execAsync = promisify(exec);
const MODULE = 'api:dosing:auto';

/**
 * Helper function to run Python auto dosing commands
 */
async function runAutoDoseCommand(command: string, args: any = {}): Promise<any> {
  try {
    // Construct the Python command
    const pythonCommand = `
      import sys
      import json
      import asyncio
      ${command === 'update_config' ? 'from auto_dosing_integration import update_auto_dosing_config' : ''}
      ${command === 'enable' ? 'from auto_dosing_integration import enable_auto_dosing' : ''}
      ${command === 'disable' ? 'from auto_dosing_integration import disable_auto_dosing' : ''}
      ${command === 'status' ? 'from auto_dosing_integration import get_auto_dosing_status' : ''}
      ${command === 'history' ? 'from auto_dosing_integration import get_auto_dosing_history' : ''}
      
      async def main():
          ${command === 'update_config' ? `result = update_auto_dosing_config(${JSON.stringify(args)})` : ''}
          ${command === 'enable' ? 'await enable_auto_dosing()' : ''}
          ${command === 'disable' ? 'await disable_auto_dosing()' : ''}
          ${command === 'status' ? 'result = get_auto_dosing_status()' : ''}
          ${command === 'history' ? `result = get_auto_dosing_history(${args.limit || 50})` : ''}
          
          ${command !== 'enable' && command !== 'disable' ? 'print(json.dumps(result))' : 'print(json.dumps({"success": True}))'}
      
      if __name__ == "__main__":
          asyncio.run(main())
    `;
    
    // Execute the Python script
    const { stdout, stderr } = await execAsync(`python -c '${pythonCommand}'`);
    
    if (stderr) {
      warn(MODULE, `Command produced stderr: ${stderr}`);
    }
    
    // Parse the JSON result
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (err) {
    error(MODULE, `Error running auto dose command '${command}':`, err);
    throw err;
  }
}

/**
 * GET handler - get auto dosing status or history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'status';
    
    if (type === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const history = await runAutoDoseCommand('history', { limit });
      
      return NextResponse.json({
        status: 'success',
        data: history
      });
    } else {
      // Default to status
      const status = await runAutoDoseCommand('status');
      
      return NextResponse.json({
        status: 'success',
        data: status
      });
    }
  } catch (err) {
    error(MODULE, 'Error in GET handler:', err);
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to get auto dosing information',
      message: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}

/**
 * POST handler - control auto dosing (enable/disable/update config)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;
    
    if (!action) {
      return NextResponse.json({
        status: 'error',
        error: 'Missing action parameter'
      }, { status: 400 });
    }
    
    switch (action) {
      case 'enable':
        await runAutoDoseCommand('enable');
        info(MODULE, 'Auto dosing enabled');
        
        return NextResponse.json({
          status: 'success',
          message: 'Auto dosing enabled'
        });
        
      case 'disable':
        await runAutoDoseCommand('disable');
        info(MODULE, 'Auto dosing disabled');
        
        return NextResponse.json({
          status: 'success',
          message: 'Auto dosing disabled'
        });
        
      case 'updateConfig':
        if (!config) {
          return NextResponse.json({
            status: 'error',
            error: 'Missing config parameter for updateConfig action'
          }, { status: 400 });
        }
        
        const updatedConfig = await runAutoDoseCommand('update_config', config);
        info(MODULE, 'Auto dosing configuration updated', updatedConfig);
        
        return NextResponse.json({
          status: 'success',
          message: 'Auto dosing configuration updated',
          data: updatedConfig
        });
        
      default:
        return NextResponse.json({
          status: 'error',
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }
  } catch (err) {
    error(MODULE, 'Error in POST handler:', err);
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to process auto dosing request',
      message: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
} 
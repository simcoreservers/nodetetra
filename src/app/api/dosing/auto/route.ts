import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { error, info, debug, warn } from '@/app/lib/logger';
import { ChildProcess } from 'child_process';

const execAsync = promisify(exec);
const MODULE = 'api:dosing:auto';

/**
 * Helper function to run Python auto dosing commands
 */
async function runAutoDoseCommand(command: string, args: any = {}): Promise<any> {
  try {
    // Construct the Python command - without indentation to avoid Python syntax errors
    const pythonCommand = `import sys
import json
import asyncio
import os
import subprocess

# Improved diagnostic information
try:
    print("---- Auto Dosing API Command Diagnostics ----", file=sys.stderr)
    print("Running command: " + "${command}", file=sys.stderr)
    pids = subprocess.run(["pgrep", "-fa", "python.*auto_dosing_integration.py"], capture_output=True, text=True).stdout.strip()
    print(f"Found auto_dosing processes: {pids}", file=sys.stderr)
    
    # Check for status file - ensure strings are properly quoted
    data_dir = 'data'  # Define as string variable to avoid quoting issues
    status_filename = 'auto_dosing_status.json'  # Define as string variable to avoid quoting issues
    status_file = os.path.join(os.getcwd(), data_dir, status_filename)
    if os.path.exists(status_file):
        with open(status_file, 'r') as f:
            status_data = json.load(f)
            print(f"Status file contents: {status_data}", file=sys.stderr)
    else:
        print(f"Status file not found at: {status_file}", file=sys.stderr)
except Exception as e:
    print(f"Diagnostics error: {e}", file=sys.stderr)

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
    asyncio.run(main())`;
    
    // Fix for string interpolation in Python command
    // Make sure all quotes are properly escaped, especially in the diagnostic section
    const safePythonCommand = pythonCommand.replace(/os\.path\.join\(os\.getcwd\(\), ['']?data['']?, ['']?auto_dosing_status\.json['']?\)/g, 
      "os.path.join(os.getcwd(), 'data', 'auto_dosing_status.json')");
    
    // Execute the Python script with fixed command
    const { stdout, stderr } = await execAsync(`python -c '${safePythonCommand}'`);
    
    if (stderr) {
      // Log stdout and stderr for debugging
      info(MODULE, `Command output (stdout): ${stdout}`);
      info(MODULE, `Command diagnostics (stderr): ${stderr}`);
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
    
    // Additional direct file check for better reliability
    if (type === 'status') {
      try {
        const { promises: fs } = require('fs');
        const path = require('path');
        const statusPath = path.join(process.cwd(), 'data', 'auto_dosing_status.json');
        
        // Check if the status file exists
        const fileExists = await fs.stat(statusPath).then(() => true).catch(() => false);
        if (fileExists) {
          info(MODULE, `Found status file at ${statusPath}`);
          const statusData = JSON.parse(await fs.readFile(statusPath, 'utf8'));
          
          // Check if the process is actually running
          if (statusData.pid > 0) {
            const { exec } = require('child_process');
            exec(`ps -p ${statusData.pid}`, (error, stdout, stderr) => {
              if (!error && stdout.includes(String(statusData.pid))) {
                info(MODULE, `Process with PID ${statusData.pid} is running`);
              } else {
                info(MODULE, `Process with PID ${statusData.pid} is not running`);
                // Update the status file to reflect that process is not running
                statusData.running = false;
                fs.writeFile(statusPath, JSON.stringify(statusData, null, 2)).catch(err => {
                  error(MODULE, `Error updating status file: ${err}`);
                });
              }
            });
          }
        } else {
          info(MODULE, `Status file not found at ${statusPath}`);
        }
      } catch (err) {
        warn(MODULE, `Error checking status file: ${err}`);
      }
    }
    
    if (type === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const history = await runAutoDoseCommand('history', { limit });
      
      return NextResponse.json({
        status: 'success',
        data: history
      });
    } else {
      // Default to status
      // First try the Python command
      const pyStatus = await runAutoDoseCommand('status').catch(err => {
        warn(MODULE, `Error from Python status command: ${err}`);
        return null;
      });
      
      // Then try direct file access as fallback
      let fileStatus = null;
      try {
        const { promises: fs } = require('fs');
        const path = require('path');
        const statusPath = path.join(process.cwd(), 'data', 'auto_dosing_status.json');
        
        if (await fs.stat(statusPath).then(() => true).catch(() => false)) {
          fileStatus = JSON.parse(await fs.readFile(statusPath, 'utf8'));
          info(MODULE, `Read status directly from file: ${JSON.stringify(fileStatus)}`);
        }
      } catch (err) {
        warn(MODULE, `Error reading status file directly: ${err}`);
      }
      
      // Combine information, with Python command taking precedence
      let finalStatus;
      if (pyStatus) {
        finalStatus = pyStatus;
        // Enhance with file status if available
        if (fileStatus && fileStatus.pid > 0) {
          // Use running status from file if Python doesn't think it's running
          if (!finalStatus.running && fileStatus.running) {
            finalStatus.running = true;
            finalStatus.initialized = true;
            info(MODULE, 'Using running status from file to override Python response');
          }
        }
      } else if (fileStatus) {
        // Use file status as fallback
        finalStatus = {
          enabled: fileStatus.enabled,
          running: fileStatus.running,
          initialized: fileStatus.running, // If running, must be initialized
          last_check_time: fileStatus.timestamp || 0,
          last_dosing_time: fileStatus.last_dosing_time || fileStatus.timestamp || 0, // Use last_dosing_time if available, otherwise use timestamp
          in_cooldown: false,
          cooldown_remaining: 0,
          config: {
            check_interval: 60,
            dosing_cooldown: 300,
            between_dose_delay: 30,
            ph_tolerance: 0.2,
            ec_tolerance: 0.2
          }
        };
        info(MODULE, 'Using status file as fallback');
      } else {
        // Last resort default values
        finalStatus = {
          enabled: false,
          running: false,
          initialized: false,
          last_check_time: 0,
          last_dosing_time: 0,
          in_cooldown: false,
          cooldown_remaining: 0,
          config: {
            check_interval: 60,
            dosing_cooldown: 300,
            between_dose_delay: 30,
            ph_tolerance: 0.2,
            ec_tolerance: 0.2
          }
        };
        warn(MODULE, 'Using default status values - both methods failed');
      }
      
      return NextResponse.json({
        status: 'success',
        data: finalStatus
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
        try {
          // Create data directory if it doesn't exist yet
          try {
            const { promises: fs } = require('fs');
            const path = require('path');
            const dataDir = path.join(process.cwd(), 'data');
            await fs.mkdir(dataDir, { recursive: true });
            info(MODULE, `Ensured data directory exists at ${dataDir}`);
          } catch (dirErr: unknown) {
            warn(MODULE, `Could not create data directory: ${dirErr}`);
            // Continue anyway, the Python script should handle this
          }
          
          // Run the disable command with extra error handling
          await runAutoDoseCommand('disable').catch((disableErr: unknown) => {
            error(MODULE, `Error from Python disable command: ${disableErr}`);
            // Continue and try to help recover
            
            // Try to create a status file directly if the command failed
            try {
              const { promises: fs } = require('fs');
              const path = require('path');
              const statusPath = path.join(process.cwd(), 'data', 'auto_dosing_status.json');
              
              const statusData = {
                enabled: false,
                running: false,
                pid: 0,
                timestamp: Date.now() / 1000
              };
              
              fs.writeFile(statusPath, JSON.stringify(statusData, null, 2)).catch((writeErr: unknown) => {
                error(MODULE, `Error creating backup status file: ${writeErr}`);
              });
            } catch (fileErr: unknown) {
              error(MODULE, `Error in backup status file creation: ${fileErr}`);
            }
            
            // No need to re-throw, we'll handle gracefully
          });
          
          info(MODULE, 'Auto dosing disabled');
          
          return NextResponse.json({
            status: 'success',
            message: 'Auto dosing disabled'
          });
        } catch (err: unknown) {
          error(MODULE, 'Critical error in disable action:', err);
          return NextResponse.json({
            status: 'error',
            error: 'Failed to disable auto dosing',
            message: err instanceof Error ? err.message : String(err),
            details: 'The system may be in an inconsistent state'
          }, { status: 500 });
        }
        
      case 'updateConfig':
        if (!config) {
          return NextResponse.json({
            status: 'error',
            error: 'Missing config parameter for updateConfig action'
          }, { status: 400 });
        }
        
        info(MODULE, 'Updating auto dosing configuration with values:', config);
        
        // Wait a bit longer for this command as it might restart the process
        const updatedConfig = await runAutoDoseCommand('update_config', config)
          .catch(err => {
            error(MODULE, 'Error updating auto dosing config:', err);
            throw err;
          });
          
        info(MODULE, 'Auto dosing configuration updated successfully', updatedConfig);
        
        // Delay before returning to give Python process time to restart if needed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fetch the latest status to confirm changes
        try {
          const latestStatus = await runAutoDoseCommand('status');
          info(MODULE, 'Latest auto dosing status after config update:', latestStatus);
        } catch (err) {
          warn(MODULE, 'Failed to get status after config update - might be restarting');
        }
        
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
import { NextResponse } from 'next/server';
import os from 'os';

// Function to get CPU usage - will be called periodically
const getCpuUsage = async (): Promise<number> => {
  return new Promise((resolve) => {
    const startMeasure = {
      idle: os.cpus().reduce((acc, cpu) => acc + cpu.times.idle, 0),
      total: os.cpus().reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0)
    };
    
    // Wait 100ms for next measurement
    setTimeout(() => {
      const endMeasure = {
        idle: os.cpus().reduce((acc, cpu) => acc + cpu.times.idle, 0),
        total: os.cpus().reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0)
      };
      
      const idleDiff = endMeasure.idle - startMeasure.idle;
      const totalDiff = endMeasure.total - startMeasure.total;
      
      const cpuUsage = 100 - (100 * idleDiff / totalDiff);
      resolve(parseFloat(cpuUsage.toFixed(1)));
    }, 100);
  });
};

// Convert bytes to human-readable format
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format uptime to human-readable format
const formatUptime = (uptime: number) => {
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptime % (60 * 60)) / 60);
  
  return `${days}d ${hours}h ${minutes}m`;
};

export async function GET() {
  try {
    // Get CPU information
    const cpuUsage = await getCpuUsage();
    const cpuModel = os.cpus()[0].model;
    const cpuCores = os.cpus().length;
    
    // Get memory information
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = parseFloat(((usedMemory / totalMemory) * 100).toFixed(1));
    
    // Get system information
    const platform = os.platform();
    const hostname = os.hostname();
    const uptime = formatUptime(os.uptime());
    
    // Create response object
    const systemData = {
      cpu: {
        model: cpuModel,
        cores: cpuCores,
        usage: cpuUsage,
      },
      memory: {
        total: formatBytes(totalMemory),
        used: formatBytes(usedMemory),
        free: formatBytes(freeMemory),
        usage: memoryUsage,
      },
      system: {
        platform,
        hostname,
        uptime,
        type: os.type(),
        architecture: os.arch(),
      },
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(systemData);
  } catch (error) {
    console.error('Error fetching system information:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system information' },
      { status: 500 }
    );
  }
} 
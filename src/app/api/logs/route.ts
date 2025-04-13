import { NextResponse } from 'next/server';

// Types to match the frontend expectations
interface LogEntry {
  id: number;
  timestamp: string;
  ph: number;
  ec: number;
  waterTemp: number;
  pumpActivity: string;
}

interface ChartData {
  ph: number[];
  ec: number[];
  waterTemp: number[];
  timestamps: string[];
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export async function GET(request: Request) {
  // Parse URL and get search params
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '24h';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '10');

  try {
    // Generate mock data based on parameters - in a real app, this would fetch from a database
    const mockLogs: LogEntry[] = Array.from({ length: pageSize }, (_, i) => {
      const date = new Date();
      date.setHours(date.getHours() - i - (page - 1) * pageSize);
      
      return {
        id: i + 1 + (page - 1) * pageSize,
        timestamp: date.toLocaleString(),
        ph: 6.0 + Math.random() * 0.5,
        ec: 1.2 + Math.random() * 0.3,
        waterTemp: 22 + Math.random() * 2,
        pumpActivity: Math.random() > 0.7 ? 'Nutrient A: 10ml' : 'None'
      };
    });
    
    // Generate chart data based on time range
    let dataPoints = 24;
    let hourIncrement = 1;
    
    switch(timeRange) {
      case '1h':
        dataPoints = 12;
        hourIncrement = 0.1;
        break;
      case '6h':
        dataPoints = 24;
        hourIncrement = 0.25;
        break;
      case '7d':
        dataPoints = 28;
        hourIncrement = 6;
        break;
      case '30d':
        dataPoints = 30;
        hourIncrement = 24;
        break;
      default: // 24h
        dataPoints = 24;
        hourIncrement = 1;
    }

    // Generate timestamps first
    const timestamps = Array.from({ length: dataPoints }, (_, i) => {
      const date = new Date();
      date.setHours(date.getHours() - i * hourIncrement);
      return date.toLocaleTimeString();
    }).reverse();

    const mockChartData: ChartData = {
      ph: Array.from({ length: dataPoints }, () => 5.8 + Math.random() * 0.8),
      ec: Array.from({ length: dataPoints }, () => 1.0 + Math.random() * 0.5),
      waterTemp: Array.from({ length: dataPoints }, () => 20 + Math.random() * 4),
      timestamps: timestamps
    };

    // Create response object
    const responseData = {
      logs: mockLogs,
      chartData: mockChartData,
      pagination: {
        currentPage: page,
        totalPages: 5,
        totalCount: 50,
        pageSize: pageSize
      }
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error generating log data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch log data' },
      { status: 500 }
    );
  }
} 
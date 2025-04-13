"use client";

import { useState, useEffect } from 'react';

export interface LogEntry {
  id: number;
  timestamp: string;
  ph: number;
  ec: number;
  waterTemp: number;
  pumpActivity: string;
}

export interface ChartData {
  ph: number[];
  ec: number[];
  waterTemp: number[];
  timestamps: string[];
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

export interface LogData {
  logs: LogEntry[];
  chartData: ChartData;
  pagination: PaginationInfo;
}

interface UseLogDataProps {
  timeRange?: string;
  page?: number;
  pageSize?: number;
  refreshInterval?: number;
}

export function useLogData({
  timeRange = '24h',
  page = 1,
  pageSize = 10,
  refreshInterval = 0
}: UseLogDataProps = {}) {
  const [data, setData] = useState<LogData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  const fetchLogData = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, this would be a fetch to your API with query params
      const response = await fetch(
        `/api/logs?timeRange=${timeRange}&page=${page}&pageSize=${pageSize}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      setData(responseData);
      setError(null);
    } catch (err) {
      console.error('Error fetching log data:', err);
      
      // For development purposes, return mock data if the API isn't implemented yet
      // REMOVE THIS IN PRODUCTION
      const mockLogs: LogEntry[] = Array.from({ length: 10 }, (_, i) => {
        const date = new Date();
        date.setHours(date.getHours() - i);
        
        return {
          id: i + 1,
          timestamp: date.toLocaleString(),
          ph: 6.0 + Math.random() * 0.5,
          ec: 1.2 + Math.random() * 0.3,
          waterTemp: 22 + Math.random() * 2,
          pumpActivity: Math.random() > 0.7 ? 'Nutrient A: 10ml' : 'None'
        };
      });
      
      const mockChartData: ChartData = {
        ph: Array.from({ length: 24 }, () => 5.8 + Math.random() * 0.8),
        ec: Array.from({ length: 24 }, () => 1.0 + Math.random() * 0.5),
        waterTemp: Array.from({ length: 24 }, () => 20 + Math.random() * 4),
        timestamps: Array.from({ length: 24 }, (_, i) => {
          const date = new Date();
          date.setHours(date.getHours() - i);
          return date.toLocaleTimeString();
        }).reverse()
      };
      
      // Set mock data
      setData({
        logs: mockLogs,
        chartData: mockChartData,
        pagination: {
          currentPage: page,
          totalPages: 5,
          totalCount: 50,
          pageSize: pageSize
        }
      });
      
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Export data to CSV or JSON
  const exportData = async (format: 'csv' | 'json' = 'csv') => {
    try {
      if (!data) throw new Error('No data to export');
      
      if (format === 'csv') {
        // Generate CSV
        const headers = ['Timestamp', 'pH', 'EC', 'Water Temp', 'Pump Activity'];
        const csvData = [
          headers.join(','),
          ...data.logs.map(log => 
            `"${log.timestamp}",${log.ph},${log.ec},${log.waterTemp},"${log.pumpActivity}"`
          )
        ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `log_data_${new Date().toISOString().split('T')[0]}.csv`);
        a.click();
        URL.revokeObjectURL(url);
        
        return true;
      } else {
        // Download JSON
        const jsonData = JSON.stringify(data.logs, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', `log_data_${new Date().toISOString().split('T')[0]}.json`);
        a.click();
        URL.revokeObjectURL(url);
        
        return true;
      }
    } catch (err) {
      console.error('Error exporting data:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };
  
  // Generate a report
  const generateReport = async () => {
    try {
      // This would usually make a request to generate a report
      console.log(`Generating report for time range: ${timeRange}`);
      
      // Simulate report generation success
      return { success: true, message: 'Report generated successfully' };
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return { success: false, message: 'Failed to generate report' };
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchLogData();
  }, [timeRange, page, pageSize]);
  
  // Set up interval for refreshing data
  useEffect(() => {
    if (refreshInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchLogData();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval, timeRange, page, pageSize]);
  
  return {
    data,
    isLoading,
    error,
    refresh: fetchLogData,
    exportData,
    generateReport,
    pagination: data?.pagination || {
      currentPage: page,
      totalPages: 1,
      totalCount: 0,
      pageSize: pageSize
    }
  };
} 
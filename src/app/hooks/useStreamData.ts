"use client";

import { useState, useEffect } from 'react';

interface StreamData {
  sensors: {
    ph: number;
    ec: number;
    waterTemp: number;
    timestamp: string;
    status: string;
  };
  pumps: Array<{
    name: string;
    active: boolean;
    pinNumber: number;
    flowRate?: number;
  }>;
  autoDosing: {
    enabled: boolean;
    timestamp: string;
  };
}

export function useStreamData() {
  const [data, setData] = useState<StreamData | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    
    const connectToStream = () => {
      console.log('Connecting to real-time data stream...');
      
      // Close existing connection if any
      if (eventSource) {
        eventSource.close();
        setIsConnected(false);
      }
      
      // Create new SSE connection
      eventSource = new EventSource('/api/stream');
      
      // Connection opened
      eventSource.onopen = () => {
        console.log('Stream connection established');
        setIsConnected(true);
        setError(null);
      };
      
      // Listen for messages
      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data) as StreamData;
          setData(streamData);
        } catch (err) {
          console.error('Error parsing stream data:', err);
        }
      };
      
      // Handle errors
      eventSource.onerror = (event) => {
        console.error('Stream connection error:', event);
        setError(new Error('Stream connection failed'));
        setIsConnected(false);
        
        // Try to reconnect after a delay
        setTimeout(() => {
          if (eventSource) {
            eventSource.close();
            connectToStream();
          }
        }, 5000); // 5 second reconnection delay
      };
    };
    
    // Initial connection
    connectToStream();
    
    // Cleanup function
    return () => {
      console.log('Closing stream connection');
      if (eventSource) {
        eventSource.close();
        setIsConnected(false);
      }
    };
  }, []);

  return {
    data,
    isConnected,
    error,
  };
} 
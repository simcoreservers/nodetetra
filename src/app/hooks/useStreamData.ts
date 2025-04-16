"use client";

import { useState, useEffect, useRef } from 'react';

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
    pinNumber?: number;
    flowRate?: number;
    nutrient?: {
      productId: number;
      brandId: number;
      brandName: string;
      productName: string;
      npk: string;
    } | null;
    lastActivated?: Date;
    error?: string;
  }>;
  autoDosing: {
    enabled: boolean;
    timestamp: string;
  };
}

interface UseStreamDataOptions {
  onData?: (data: StreamData) => void;
}

/**
 * Custom hook for real-time data streaming
 * @param options Configuration options
 * @returns The current stream data and connection state
 */
export function useStreamData(options: UseStreamDataOptions = {}) {
  const [data, setData] = useState<StreamData | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Track event source instances
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Track reconnection attempts
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // Start with 1 second delay
  
  // Extract options
  const { onData } = options;

  useEffect(() => {
    let reconnectTimeoutId: NodeJS.Timeout | null = null;
    
    const connectToStream = () => {
      console.log('Connecting to real-time data stream...');
      
      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
      }
      
      try {
        // Create new SSE connection with no caching
        const eventSource = new EventSource('/api/stream', { withCredentials: false });
        eventSourceRef.current = eventSource;
        
        // Connection opened
        eventSource.onopen = () => {
          console.log('Stream connection established');
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0; // Reset reconnect counter on successful connection
        };
        
        // Listen for messages
        eventSource.onmessage = (event) => {
          try {
            const streamData = JSON.parse(event.data) as StreamData;
            setData(streamData);
            
            // Call optional onData callback for immediate UI updates
            if (onData) {
              onData(streamData);
            }
          } catch (err) {
            console.error('Error parsing stream data:', err);
          }
        };
        
        // Handle errors
        eventSource.onerror = (event) => {
          console.error('Stream connection error:', event);
          setError(new Error('Stream connection failed'));
          setIsConnected(false);
          
          // Clean up the errored connection
          eventSource.close();
          eventSourceRef.current = null;
          
          // Try to reconnect with exponential backoff
          reconnectAttemptsRef.current++;
          
          if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
            const delay = Math.min(30000, reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current));
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current} of ${maxReconnectAttempts})`);
            
            reconnectTimeoutId = setTimeout(connectToStream, delay);
          } else {
            console.error(`Maximum reconnect attempts (${maxReconnectAttempts}) reached. Giving up.`);
          }
        };
      } catch (err) {
        console.error('Error creating EventSource:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };
    
    // Initial connection
    connectToStream();
    
    // Cleanup function
    return () => {
      console.log('Closing stream connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
      
      setIsConnected(false);
    };
  }, [onData]);

  // Provide ability to manually reconnect
  const reconnect = () => {
    console.log('Manually reconnecting to stream...');
    reconnectAttemptsRef.current = 0; // Reset counter on manual reconnect
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Create a new EventSource
    const eventSource = new EventSource('/api/stream');
    eventSourceRef.current = eventSource;
    
    // Set up event handlers (simplified for manual reconnection)
    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };
    
    eventSource.onmessage = (event) => {
      try {
        const streamData = JSON.parse(event.data) as StreamData;
        setData(streamData);
        if (onData) onData(streamData);
      } catch (err) {
        console.error('Error parsing stream data:', err);
      }
    };
    
    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error('Stream connection failed after manual reconnect'));
      eventSource.close();
    };
  };

  return {
    data,
    isConnected,
    error,
    reconnect
  };
} 
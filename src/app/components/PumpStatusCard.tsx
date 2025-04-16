'use client';

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { motion, AnimatePresence } from 'framer-motion';

interface PumpData {
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
}

interface PumpStatusCardProps {
  pumpStatus: PumpData[] | null;
  isLoading: boolean;
  hasError: boolean;
  className?: string;
  justChanged?: boolean;
}

export default function PumpStatusCard({ 
  pumpStatus, 
  isLoading, 
  hasError, 
  className = "", 
  justChanged = false 
}: PumpStatusCardProps) {
  const [recentlyChanged, setRecentlyChanged] = useState<Record<string, boolean>>({});
  
  // Highlight recently changed pumps
  useEffect(() => {
    if (justChanged && pumpStatus) {
      // Create a new record of which pumps are currently active
      const newChanges: Record<string, boolean> = {};
      
      pumpStatus.forEach(pump => {
        newChanges[pump.name] = true;
      });
      
      // Set the recently changed pumps
      setRecentlyChanged(newChanges);
      
      // Clear the highlight after a short delay
      const timeout = setTimeout(() => {
        setRecentlyChanged({});
      }, 1000); // 1 second highlight
      
      return () => clearTimeout(timeout);
    }
  }, [justChanged, pumpStatus]);

  if (isLoading) {
    return (
      <div className={`card ${className}`}>
        <div className="card-header skeleton-loader h-8 w-48 my-1"></div>
        <div className="card-content flex flex-col gap-3">
          <div className="skeleton-loader h-16 w-full"></div>
          <div className="skeleton-loader h-16 w-full"></div>
          <div className="skeleton-loader h-16 w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card h-full ${className}`}>
      <div className="card-header">
        <h2 className="card-title">Pump Status</h2>
        <Link href="/pumps" className="btn text-sm">Manual Control</Link>
      </div>
      <div className="card-content h-full">
        {hasError ? (
          <div className="text-error py-3">
            <span className="block">Error: Unable to fetch pump status</span>
          </div>
        ) : !pumpStatus || pumpStatus.length === 0 ? (
          <div className="text-center py-3 text-muted-foreground">
            <span className="block">No active pumps configured</span>
          </div>
        ) : (
          <div className="space-y-3">
            {pumpStatus.map((pump, index) => (
              <motion.div 
                key={pump.name || index}
                className={`p-3 border rounded-md ${pump.active ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                animate={{
                  scale: recentlyChanged[pump.name] ? [1, 1.03, 1] : 1,
                  backgroundColor: pump.active 
                    ? recentlyChanged[pump.name] 
                      ? ['rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.4)', 'rgba(34, 197, 94, 0.2)'] 
                      : 'rgba(34, 197, 94, 0.2)' 
                    : recentlyChanged[pump.name]
                      ? ['rgba(75, 85, 99, 0.2)', 'rgba(75, 85, 99, 0.4)', 'rgba(75, 85, 99, 0.2)'] 
                      : 'rgba(75, 85, 99, 0.2)'
                }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">{pump.name}</h3>
                    {pump.nutrient && (
                      <div className="text-sm text-muted-foreground">
                        {pump.nutrient.brandName} {pump.nutrient.productName}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span 
                      className={`inline-flex w-3 h-3 rounded-full mr-2 ${pump.active ? 'bg-green-500' : 'bg-gray-400'}`}
                    >
                      <AnimatePresence>
                        {pump.active && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1.5 }}
                            exit={{ opacity: 0, scale: 0 }}
                            className="absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"
                            style={{ animationDuration: "1s", animationIterationCount: "infinite" }}
                          />
                        )}
                      </AnimatePresence>
                    </span>
                    <span className={`font-medium ${pump.active ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                      {pump.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {pump.active && pump.flowRate && (
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Flow rate: {pump.flowRate} mL/min
                  </div>
                )}
                {pump.error && (
                  <div className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Error: {pump.error}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 
'use client';

import React, { memo } from 'react';
import Link from "next/link";

interface ActivityEvent {
  time: string;
  event: string;
}

interface RecentActivityCardProps {
  events: ActivityEvent[] | null;
  isLoading: boolean;
  hasError: boolean;
  hasSensorError: boolean;
  errorMessage?: string;
}

const RecentActivityCard = memo(function RecentActivityCard({
  events,
  isLoading,
  hasError,
  hasSensorError,
  errorMessage
}: RecentActivityCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Recent Activity</h2>
        <Link href="/logs" className="btn btn-secondary text-sm">View All</Link>
      </div>
      <div className="space-y-3">
        {hasSensorError ? (
          <div className="text-yellow-500 p-3 border border-yellow-700/50 bg-yellow-900/20 rounded">
            Sensor error detected. Check sensor connections and configuration.
          </div>
        ) : isLoading ? (
          <div className="animate-pulse text-center py-4">Loading activity history...</div>
        ) : hasError ? (
          <div className="text-red-500 p-3 border border-red-700/50 bg-red-900/20 rounded">
            Error loading activity history: {errorMessage || 'Unknown error'}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No recent activity to display</div>
        ) : (
          events.map((event, index) => (
            <div key={index} className="flex border-b border-[#333333] pb-2 last:border-0">
              <div className="text-sm text-[#a0a0a0] w-24">{event.time}</div>
              <div className="text-sm text-white">{event.event}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default RecentActivityCard; 
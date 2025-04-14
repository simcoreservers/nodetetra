'use client';

import React, { memo } from 'react';
import Link from "next/link";

interface GrowthScheduleWeek {
  week: number;
  growthPhase: string;
}

interface ActiveProfile {
  name: string;
  cropType: string;
  growthPhase?: string;
  targetPh: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  targetEc: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  notes?: string;
  growthSchedule?: GrowthScheduleWeek[];
}

interface ActiveProfileCardProps {
  activeProfile: ActiveProfile | null;
  isLoading: boolean;
}

const ActiveProfileCard = memo(function ActiveProfileCard({
  activeProfile,
  isLoading
}: ActiveProfileCardProps) {
  // Calculate current week for growth schedule if available
  let currentWeek = 1;
  let currentPhase = activeProfile?.growthPhase || '';
  let totalWeeks = 0;
  
  if (activeProfile?.growthSchedule && activeProfile.growthSchedule.length > 0) {
    totalWeeks = activeProfile.growthSchedule.length;
    // Find the week for the current growth phase if it exists
    const weekMatchingPhase = activeProfile.growthSchedule.find(
      week => week.growthPhase === currentPhase
    );
    
    if (weekMatchingPhase) {
      currentWeek = weekMatchingPhase.week;
    }
  }

  return (
    <div className="card relative overflow-hidden">
      {activeProfile && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00a3e0]"></div>
      )}
      <div className="card-header">
        <h2 className="card-title">Active Plant Profile</h2>
        <Link href="/profiles" className="btn btn-secondary text-sm">Manage Profiles</Link>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="animate-pulse text-center py-4">Loading profile...</div>
        ) : !activeProfile ? (
          <div className="flex flex-col items-center justify-center py-6">
            <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-gray-400 mb-3">No active plant profile selected</p>
            <Link href="/profiles" className="btn text-sm">Set Active Profile</Link>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-grow">
              <div className="flex items-center mb-4">
                <h3 className="text-xl font-semibold text-[#00a3e0]">{activeProfile.name}</h3>
                <span className="ml-2 px-2 py-0.5 bg-[#00a3e0] text-black text-xs rounded-full">Active</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="bg-[#1e1e1e] p-3 rounded-md">
                  <p className="text-gray-400 text-xs uppercase mb-1">Crop Type</p>
                  <p className="font-medium">{activeProfile.cropType}</p>
                </div>
                <div className="bg-[#1e1e1e] p-3 rounded-md">
                  <p className="text-gray-400 text-xs uppercase mb-1">Growth Phase</p>
                  <p className="font-medium">{activeProfile.growthPhase || "Not specified"}</p>
                </div>
                <div className="bg-[#1e1e1e] p-3 rounded-md">
                  <p className="text-gray-400 text-xs uppercase mb-1">Target pH Range</p>
                  <p className="font-medium">
                    {activeProfile.targetPh.min !== undefined && activeProfile.targetPh.max !== undefined
                      ? `${activeProfile.targetPh.min} - ${activeProfile.targetPh.max}`
                      : `${(activeProfile.targetPh.target - activeProfile.targetPh.buffer).toFixed(2)} - ${(activeProfile.targetPh.target + activeProfile.targetPh.buffer).toFixed(2)}`
                    }
                  </p>
                </div>
                <div className="bg-[#1e1e1e] p-3 rounded-md">
                  <p className="text-gray-400 text-xs uppercase mb-1">Target EC Range</p>
                  <p className="font-medium">
                    {activeProfile.targetEc.min !== undefined && activeProfile.targetEc.max !== undefined
                      ? `${activeProfile.targetEc.min} - ${activeProfile.targetEc.max}`
                      : `${(activeProfile.targetEc.target - activeProfile.targetEc.buffer).toFixed(2)} - ${(activeProfile.targetEc.target + activeProfile.targetEc.buffer).toFixed(2)}`
                    } mS/cm
                  </p>
                </div>
              </div>
              {activeProfile.notes && (
                <div className="bg-[#1e1e1e] p-3 rounded-md mb-4">
                  <p className="text-gray-400 text-xs uppercase mb-1">Notes</p>
                  <p className="text-sm">{activeProfile.notes}</p>
                </div>
              )}
            </div>
            
            {totalWeeks > 0 && (
              <div className="bg-[#162736] border border-[#00a3e0]/20 p-5 rounded-lg flex flex-col items-center min-w-[220px] shadow-[0_0_15px_rgba(0,163,224,0.15)]">
                <h4 className="text-sm text-[#00a3e0] mb-3 uppercase font-medium">Growth Progress</h4>
                <div className="w-16 h-16 rounded-full border-4 border-[#333] flex items-center justify-center mb-3 relative">
                  <svg className="w-full h-full absolute" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#444"
                      strokeWidth="1"
                      strokeDasharray="100, 100"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="url(#gradient)"
                      strokeWidth="3"
                      strokeDasharray={`${Math.min(100, (currentWeek / totalWeeks) * 100)}, 100`}
                      className="progress-circle"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00a3e0" />
                        <stop offset="100%" stopColor="#00f0c7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="text-center">
                    <div className="text-xl font-bold">{currentWeek}</div>
                    <div className="text-xs text-gray-400">WEEK</div>
                  </div>
                </div>
                <div className="text-center mb-3">
                  <p className="font-medium text-lg">{currentPhase}</p>
                  <p className="text-xs text-gray-400">CURRENT PHASE</p>
                </div>
                <div className="w-full bg-[#333333] rounded-full h-1.5 mb-2">
                  <div 
                    className="bg-gradient-to-r from-[#00a3e0] to-[#00f0c7] h-1.5 rounded-full" 
                    style={{ width: `${Math.min(100, (currentWeek / totalWeeks) * 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between w-full text-xs text-gray-400">
                  <span>Week 1</span>
                  <span>Week {totalWeeks}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ActiveProfileCard; 
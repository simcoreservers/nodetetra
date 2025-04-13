"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';
import { useSidebar } from '@/app/components/SidebarContext';

export default function CalibrationPage() {
  const [activeSection, setActiveSection] = useState("calibration");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [calibrationData, setCalibrationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { collapsed } = useSidebar();
  const router = useRouter();

  // Fetch calibration data
  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch('/api/calibration');
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        setCalibrationData(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load calibration data');
        setLoading(false);
        console.error('Error loading calibration data:', err);
      }
    };
    
    fetchCalibration();
  }, []);

  // Handle reset all calibrations
  const handleResetAll = async () => {
    if (!confirm('Are you sure you want to reset all calibration data? This cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/calibration', {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Reload the data
      const refreshResponse = await fetch('/api/calibration');
      const data = await refreshResponse.json();
      setCalibrationData(data);
      alert('All calibration data has been reset successfully');
    } catch (err) {
      setError('Failed to reset calibration data');
      console.error('Error resetting calibration data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 overflow-auto ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Sensor Calibration</h1>
          <p className="text-gray-400">Calibrate your pH, EC, and temperature sensors for accurate readings</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00a3e0]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-900 text-white p-4 rounded mb-4">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* pH Calibration Card */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="card-title">pH Sensor</h2>
                <span className={`px-2 py-1 rounded text-sm ${
                  calibrationData?.ph?.isCalibrated 
                    ? 'bg-green-900/30 text-green-400' 
                    : 'bg-yellow-900/30 text-yellow-400'
                }`}>
                  {calibrationData?.ph?.isCalibrated ? 'Calibrated' : 'Needs Calibration'}
                </span>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  {calibrationData?.ph?.lastCalibrated ? (
                    <p className="text-sm text-gray-400">
                      Last calibrated: {new Date(calibrationData.ph.lastCalibrated).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Not yet calibrated</p>
                  )}
                </div>
                <p className="mb-6">pH sensors require a 2 or 3-point calibration for accuracy. Calibrate using standard pH buffer solutions (4.0, 7.0, and 10.0).</p>
                <Link href="/calibration/ph" className="btn">
                  Calibrate pH Sensor
                </Link>
              </div>
            </div>

            {/* EC Calibration Card */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="card-title">EC Sensor</h2>
                <span className={`px-2 py-1 rounded text-sm ${
                  calibrationData?.ec?.isCalibrated 
                    ? 'bg-green-900/30 text-green-400' 
                    : 'bg-yellow-900/30 text-yellow-400'
                }`}>
                  {calibrationData?.ec?.isCalibrated ? 'Calibrated' : 'Needs Calibration'}
                </span>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  {calibrationData?.ec?.lastCalibrated ? (
                    <p className="text-sm text-gray-400">
                      Last calibrated: {new Date(calibrationData.ec.lastCalibrated).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Not yet calibrated</p>
                  )}
                </div>
                <p className="mb-6">EC sensors require single-point calibration. Use a standardized EC solution (typically 1.413 mS/cm) for calibration.</p>
                <Link href="/calibration/ec" className="btn">
                  Calibrate EC Sensor
                </Link>
              </div>
            </div>
            
            {/* Temperature Calibration Card */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="card-title">Temperature Sensor</h2>
                <span className={`px-2 py-1 rounded text-sm ${
                  calibrationData?.temperature?.isCalibrated 
                    ? 'bg-green-900/30 text-green-400' 
                    : 'bg-yellow-900/30 text-yellow-400'
                }`}>
                  {calibrationData?.temperature?.isCalibrated ? 'Calibrated' : 'Needs Calibration'}
                </span>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  {calibrationData?.temperature?.lastCalibrated ? (
                    <p className="text-sm text-gray-400">
                      Last calibrated: {new Date(calibrationData.temperature.lastCalibrated).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Not yet calibrated</p>
                  )}
                </div>
                <p className="mb-6">Temperature sensors require a single-point calibration. Use a reference thermometer to ensure accurate readings.</p>
                <Link href="/calibration/temperature" className="btn">
                  Calibrate Temperature Sensor
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Reset All Button */}
        <div className="mt-8 text-center">
          <button 
            className="btn btn-secondary bg-red-800 hover:bg-red-700"
            onClick={handleResetAll}
            disabled={loading}
          >
            Reset All Calibration Data
          </button>
        </div>
      </div>
    </div>
  );
} 
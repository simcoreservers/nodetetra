"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/app/components/Sidebar';
import { useSidebar } from '@/app/components/SidebarContext';

interface TemperatureCalibration {
  offset: number;
  referenceReading: number;
  sensorReading: number;
  lastCalibrated: string | null;
  isCalibrated: boolean;
}

export default function TemperatureCalibrationPage() {
  const [activeSection, setActiveSection] = useState("calibration");
  const { collapsed } = useSidebar();
  const router = useRouter();
  const [calibrationData, setCalibrationData] = useState<TemperatureCalibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorReading, setSensorReading] = useState<number | null>(null);
  const [referenceReading, setReferenceReading] = useState<number>(25.0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [sensorPolling, setSensorPolling] = useState(false);
  const [stabilizing, setStabilizing] = useState(false);
  const [stabilized, setStabilized] = useState(false);
  const [previousReadings, setPreviousReadings] = useState<number[]>([]);
  const [calibrationStep, setCalibrationStep] = useState(0);
  
  // Fetch temperature calibration data
  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch('/api/calibration/temperature');
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        setCalibrationData(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load temperature calibration data');
        setLoading(false);
        console.error('Error loading temperature calibration data:', err);
      }
    };
    
    fetchCalibration();
  }, []);
  
  // Simulate temperature sensor reading with stabilization detection
  useEffect(() => {
    if (!sensorPolling) return;
    
    const interval = setInterval(() => {
      // In a real implementation, this would be an API call to get the current sensor reading
      // For simulation, we'll use the reference value with some noise and drift
      
      // Add some random noise to simulate real sensor behavior
      const randomNoise = Math.random() * 0.3 - 0.15;
      // Small additional offset to simulate uncalibrated state
      const driftOffset = -0.5;
      
      const simulatedReading = referenceReading + randomNoise + driftOffset;
      const newReading = parseFloat(simulatedReading.toFixed(2));
      
      setSensorReading(newReading);
      
      // Add to previous readings for stabilization detection
      setPreviousReadings(prev => {
        const newReadings = [...prev, newReading].slice(-5); // Keep last 5 readings
        
        // Check if readings have stabilized (within 0.15°C)
        if (newReadings.length === 5) {
          const isStable = newReadings.every(r => 
            Math.abs(r - newReadings[0]) < 0.15
          );
          
          // If not yet stabilizing, set stabilizing
          if (!stabilizing && !isStable) {
            setStabilizing(true);
            setStabilized(false);
          }
          
          // If stabilizing and now stable, set stabilized
          if (stabilizing && isStable) {
            setStabilizing(false);
            setStabilized(true);
            
            // Auto save if calibration has stabilized in guided mode
            if (calibrationStep === 2) {
              saveCalibration();
            }
          }
        }
        
        return newReadings;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [sensorPolling, referenceReading, stabilizing, calibrationStep]);
  
  // Start guided calibration
  const startGuidedCalibration = () => {
    setCalibrationStep(1);
  };
  
  // Move to next calibration step
  const nextCalibrationStep = () => {
    setCalibrationStep(prev => prev + 1);
    
    // Reset stabilization state
    setStabilizing(false);
    setStabilized(false);
    setPreviousReadings([]);
    
    // Handle step transitions
    if (calibrationStep === 1) {
      // Start actual calibration
      startCalibration();
    } else if (calibrationStep === 3) {
      // Calibration complete
      setCalibrationStep(0);
      cancelCalibration();
    }
  };
  
  // Start calibration
  const startCalibration = () => {
    setIsCalibrating(true);
    setSensorPolling(true);
  };
  
  // Save calibration data
  const saveCalibration = async () => {
    if (sensorReading === null) return;
    
    try {
      setLoading(true);
      
      // For Atlas Scientific EZO RTD sensors, the calibration command would be:
      // Cal,<temperature value in °C>
      // e.g. Cal,25.5 for calibrating to 25.5°C
      
      const response = await fetch('/api/calibration/temperature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referenceReading: referenceReading,
          sensorReading: sensorReading
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setCalibrationData(data.data);
      
      // In guided mode, move to next step instead of stopping
      if (calibrationStep > 0) {
        setCalibrationStep(prev => prev + 1);
        setSensorPolling(false);
        setIsCalibrating(false);
        setSensorReading(null);
        setStabilizing(false);
        setStabilized(false);
        setPreviousReadings([]);
      } else {
        // Stop calibration in manual mode
        setSensorPolling(false);
        setIsCalibrating(false);
        setSensorReading(null);
        
        alert('Temperature calibration completed successfully');
      }
    } catch (err) {
      setError('Failed to save calibration data');
      console.error('Error saving calibration data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Cancel calibration
  const cancelCalibration = () => {
    setSensorPolling(false);
    setIsCalibrating(false);
    setSensorReading(null);
    setStabilizing(false);
    setStabilized(false);
    setPreviousReadings([]);
  };
  
  // Reset calibration
  const resetCalibration = async () => {
    if (!confirm('Are you sure you want to reset temperature calibration data? This cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/calibration/temperature', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Refresh calibration data
      const refreshResponse = await fetch('/api/calibration/temperature');
      const data = await refreshResponse.json();
      setCalibrationData(data);
      alert('Temperature calibration data has been reset successfully');
    } catch (err) {
      setError('Failed to reset calibration data');
      console.error('Error resetting calibration data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Render guided calibration
  const renderGuidedCalibration = () => {
    // Step 1: Introduction
    if (calibrationStep === 1) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Guided Temperature Calibration</h2>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-medium mb-4">Step 1: Preparation</h3>
            <ol className="list-decimal pl-5 mb-6 space-y-2">
              <li>Prepare a reference thermometer for comparison.</li>
              <li>Place both your sensor and reference thermometer in the same water bath.</li>
              <li>Allow both readings to stabilize.</li>
            </ol>
            <div className="text-center">
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Begin Temperature Calibration
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 2: Temperature calibration
    if (calibrationStep === 2) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibrating Temperature Sensor</h2>
          </div>
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mb-2">
                <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                <span className="text-xl ml-2">°C</span>
              </div>
              <div className="flex justify-center items-center mt-2">
                {stabilizing && (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-yellow-400 mr-2"></div>
                    <span className="text-yellow-400">Stabilizing...</span>
                  </div>
                )}
                {stabilized && (
                  <div className="flex items-center">
                    <span className="text-green-400">✓ Reading Stabilized!</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="text-center mb-4">
                <label className="block text-sm mb-2">Reference Temperature (°C)</label>
                <div className="flex justify-center">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className="bg-[#1e1e1e] border border-[#333333] rounded p-2 w-full max-w-xs text-center"
                    value={referenceReading}
                    onChange={(e) => {
                      setReferenceReading(parseFloat(e.target.value));
                      // Reset stabilization when changing reference
                      setStabilizing(false);
                      setStabilized(false);
                      setPreviousReadings([]);
                    }}
                  />
                </div>
              </div>
              
              <p className="text-center">
                Enter the temperature shown on your reference thermometer.
                The calibration will be automatically saved when the reading stabilizes.
              </p>
              
              <div className="flex justify-center space-x-4">
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    cancelCalibration();
                    setCalibrationStep(0);
                  }}
                >
                  Cancel
                </button>
                {stabilized && (
                  <button 
                    className="btn"
                    onClick={saveCalibration}
                    disabled={loading}
                  >
                    Save and Continue
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 3: Calibration complete
    if (calibrationStep === 3) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibration Complete</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center mb-4">
              <div className="text-green-400 mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <span className="text-xl">Temperature Calibration Successfully Completed</span>
            </div>
            
            <p className="text-center mb-6">
              Your temperature sensor is now calibrated and ready for accurate measurements.
              An offset of {calibrationData?.offset.toFixed(2)}°C has been applied.
            </p>
            
            <div className="text-center">
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 overflow-auto ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="mb-6 flex items-center">
          <Link href="/calibration" className="text-[#00a3e0] hover:underline mr-4">
            <span className="inline-block transform rotate-180">➔</span> Back to Calibration
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Temperature Sensor Calibration</h1>
          <p className="text-gray-400">
            Calibrate your temperature sensor against a reference thermometer
          </p>
        </div>

        {loading && !isCalibrating ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00a3e0]"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-900 text-white p-4 rounded mb-4">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Show guided calibration if in progress */}
            {calibrationStep > 0 ? (
              renderGuidedCalibration()
            ) : (
              <>
                {/* Current status */}
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">Calibration Status</h2>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-gray-400 mr-2">Status:</span>
                      <span className={`px-2 py-1 rounded text-sm ${
                        calibrationData?.isCalibrated 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-yellow-900/30 text-yellow-400'
                      }`}>
                        {calibrationData?.isCalibrated ? 'Calibrated' : 'Needs Calibration'}
                      </span>
                    </div>
                    {calibrationData?.lastCalibrated && (
                      <div className="mb-2">
                        <span className="text-gray-400 mr-2">Last calibrated:</span>
                        <span>{new Date(calibrationData.lastCalibrated).toLocaleString()}</span>
                      </div>
                    )}
                    
                    <div className="bg-[#1e1e1e] p-3 rounded mt-4">
                      <h3 className="font-medium mb-2 text-center">Calibration Details</h3>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-400 text-sm">Reference reading:</span>
                        <span className="text-sm">{calibrationData?.referenceReading || 'Not set'} °C</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-400 text-sm">Sensor reading:</span>
                        <span className="text-sm">{calibrationData?.sensorReading || 'Not set'} °C</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Offset applied:</span>
                        <span className="text-sm">{calibrationData?.offset !== undefined ? calibrationData.offset.toFixed(2) : 'Not set'} °C</span>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 mt-4">
                      <p>Note: Atlas Scientific EZO RTD temperature sensors can be calibrated with a single point.</p>
                      <p className="mt-1">For best results, calibrate at a temperature close to your operating temperature.</p>
                    </div>
                  </div>
                </div>
                
                {/* Calibration process */}
                {isCalibrating ? (
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">Calibrating Temperature Sensor</h2>
                    </div>
                    <div className="p-4">
                      <div className="mb-6 text-center">
                        <div className="mb-2">
                          <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                          <span className="text-xl ml-2">°C</span>
                        </div>
                        <div className="flex justify-center items-center mt-2">
                          {stabilizing && (
                            <div className="flex items-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-yellow-400 mr-2"></div>
                              <span className="text-yellow-400">Stabilizing...</span>
                            </div>
                          )}
                          {stabilized && (
                            <div className="flex items-center">
                              <span className="text-green-400">✓ Reading Stabilized!</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="text-center mb-4">
                          <label className="block text-sm mb-2">Reference Temperature (°C)</label>
                          <div className="flex justify-center">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              className="bg-[#1e1e1e] border border-[#333333] rounded p-2 w-full max-w-xs text-center"
                              value={referenceReading}
                              onChange={(e) => {
                                setReferenceReading(parseFloat(e.target.value));
                                setStabilizing(false);
                                setStabilized(false);
                                setPreviousReadings([]);
                              }}
                            />
                          </div>
                        </div>
                        
                        <p className="text-center">
                          Enter the temperature shown on your reference thermometer and
                          wait for the sensor reading to stabilize.
                        </p>
                        
                        <div className="flex justify-center space-x-4">
                          <button 
                            className="btn btn-secondary"
                            onClick={cancelCalibration}
                          >
                            Cancel
                          </button>
                          <button 
                            className="btn"
                            onClick={saveCalibration}
                            disabled={loading || (!stabilized && sensorPolling)}
                          >
                            {stabilized ? 'Save Calibration' : 'Waiting for Stabilization...'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">Start Calibration</h2>
                    </div>
                    <div className="p-4">
                      <p className="mb-6">
                        Temperature calibration requires a reference thermometer. Place both your sensor and 
                        reference thermometer in the same water bath and allow the readings to stabilize.
                      </p>
                      
                      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                        <div className="flex-1">
                          <h3 className="font-medium mb-2 text-center">Guided Calibration</h3>
                          <p className="text-sm text-gray-400 mb-4 text-center">
                            Step-by-step process with automatic detection.
                          </p>
                          <div className="text-center">
                            <button 
                              className="btn btn-primary"
                              onClick={startGuidedCalibration}
                            >
                              Start Guided Calibration
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex-1">
                          <h3 className="font-medium mb-2 text-center">Manual Calibration</h3>
                          <p className="text-sm text-gray-400 mb-4 text-center">
                            Standard calibration process.
                          </p>
                          <div className="text-center">
                            <button 
                              className="btn"
                              onClick={startCalibration}
                            >
                              Start Temperature Calibration
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Reset button - only show if not currently calibrating */}
                {!isCalibrating && (
                  <div className="text-center mt-4">
                    <button 
                      className="btn btn-secondary bg-red-800 hover:bg-red-700"
                      onClick={resetCalibration}
                      disabled={loading}
                    >
                      Reset Temperature Calibration Data
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 
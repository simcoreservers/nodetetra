"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/app/components/Sidebar';
import { useSidebar } from '@/app/components/SidebarContext';

interface CalibrationPoint {
  reading: number;
  voltage: number;
}

interface EcCalibration {
  point: CalibrationPoint;
  lastCalibrated: string | null;
  isCalibrated: boolean;
}

export default function ECCalibrationPage() {
  const [activeSection, setActiveSection] = useState("calibration");
  const { collapsed } = useSidebar();
  const router = useRouter();
  const [calibrationData, setCalibrationData] = useState<EcCalibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorReading, setSensorReading] = useState<number | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [sensorPolling, setSensorPolling] = useState(false);
  const [voltage, setVoltage] = useState<number | null>(null);
  const [bufferValue, setBufferValue] = useState(1.413);
  const [stabilizing, setStabilizing] = useState(false);
  const [stabilized, setStabilized] = useState(false);
  const [previousReadings, setPreviousReadings] = useState<number[]>([]);
  const [calibrationStep, setCalibrationStep] = useState(0);
  
  // Fetch EC calibration data
  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch('/api/calibration/ec');
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        setCalibrationData(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load EC calibration data');
        setLoading(false);
        console.error('Error loading EC calibration data:', err);
      }
    };
    
    fetchCalibration();
  }, []);
  
  // Simulate EC sensor reading with stabilization detection
  useEffect(() => {
    if (!sensorPolling) return;
    
    const interval = setInterval(() => {
      // In a real implementation, this would be an API call to get the current sensor reading
      // For now we'll simulate a realistic EC voltage
      const targetVoltage = bufferValue * 0.3; // Simple conversion formula for simulation
      const simulatedVoltage = targetVoltage + (Math.random() * 0.1 - 0.05);
      
      setVoltage(parseFloat(simulatedVoltage.toFixed(4)));
      
      // Convert voltage to EC (simple linear conversion, in reality would be more complex)
      const simulatedEC = simulatedVoltage / 0.3;
      const newReading = parseFloat(simulatedEC.toFixed(3));
      setSensorReading(newReading);
      
      // Add to previous readings for stabilization detection
      setPreviousReadings(prev => {
        const newReadings = [...prev, newReading].slice(-5); // Keep last 5 readings
        
        // Check if readings have stabilized (within 0.03 mS/cm)
        if (newReadings.length === 5) {
          const isStable = newReadings.every(r => 
            Math.abs(r - newReadings[0]) < 0.03
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
  }, [sensorPolling, bufferValue, stabilizing, calibrationStep]);
  
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
      
      // For Atlas Scientific EZO EC sensors, the calibration command would be:
      // Cal,<value> - where value is the EC value in μS/cm
      // E.g., Cal,1413 for a 1.413 mS/cm solution
      
      // Convert mS/cm to μS/cm for EZO command (multiply by 1000)
      const ezoCalibrationValue = bufferValue * 1000;
      
      const response = await fetch('/api/calibration/ec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reading: bufferValue, // Use the actual buffer value, not the sensor reading
          voltage: voltage || 0, // Keep voltage for backward compatibility, but EZO doesn't need it
          ezoValue: ezoCalibrationValue // For EZO-specific implementation
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
        setVoltage(null);
        setStabilizing(false);
        setStabilized(false);
        setPreviousReadings([]);
      } else {
        // Stop calibration in manual mode
        setSensorPolling(false);
        setIsCalibrating(false);
        setSensorReading(null);
        setVoltage(null);
        
        alert('EC calibration completed successfully');
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
    setVoltage(null);
  };
  
  // Reset calibration
  const resetCalibration = async () => {
    if (!confirm('Are you sure you want to reset EC calibration data? This cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/calibration/ec', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Refresh calibration data
      const refreshResponse = await fetch('/api/calibration/ec');
      const data = await refreshResponse.json();
      setCalibrationData(data);
      alert('EC calibration data has been reset successfully');
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
            <h2 className="card-title">Guided EC Calibration</h2>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-medium mb-4">Step 1: Preparation</h3>
            <ol className="list-decimal pl-5 mb-6 space-y-2">
              <li>Rinse your EC probe with distilled water and blot dry with a lint-free tissue.</li>
              <li>Prepare your calibration solution (1.413 mS/cm recommended).</li>
              <li>Make sure solution is at room temperature.</li>
            </ol>
            <div className="text-center">
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Start EC Calibration
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 2: EC calibration
    if (calibrationStep === 2) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibrating EC Sensor</h2>
          </div>
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mb-2">
                <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                <span className="text-xl ml-2">mS/cm</span>
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
                <label className="block text-sm mb-2">Calibration Solution (mS/cm)</label>
                <div className="flex justify-center">
                  <select 
                    className="bg-[#1e1e1e] border border-[#333333] rounded p-2 w-full max-w-xs"
                    value={bufferValue}
                    onChange={(e) => {
                      setBufferValue(parseFloat(e.target.value));
                      // Reset stabilization when changing buffer
                      setStabilizing(false);
                      setStabilized(false);
                      setPreviousReadings([]);
                    }}
                  >
                    <option value={1.413}>1.413 mS/cm (1413 μS/cm)</option>
                    <option value={2.76}>2.76 mS/cm (2760 μS/cm)</option>
                    <option value={12.88}>12.88 mS/cm (12880 μS/cm)</option>
                  </select>
                </div>
              </div>
              
              <p className="text-center">
                Place the EC probe in {bufferValue} mS/cm calibration solution.
                The reading will be automatically saved when it stabilizes.
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
              <span className="text-xl">EC Calibration Successfully Completed</span>
            </div>
            
            <p className="text-center mb-6">
              Your EC sensor is now calibrated and ready for accurate measurements.
              Remember to rinse your probe and store it properly when not in use.
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
          <h1 className="text-2xl font-bold mb-2">EC Sensor Calibration</h1>
          <p className="text-gray-400">
            Calibrate your EC sensor using a standard buffer solution (typically 1.413 mS/cm)
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
                      <h3 className="font-medium mb-2 text-center">Calibration Point</h3>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-400 text-sm">Status:</span>
                        <span className="text-sm">{calibrationData?.point.reading ? 'Calibrated' : 'Not set'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Reading:</span>
                        <span className="text-sm">{calibrationData?.point.reading || 'Not set'} mS/cm</span>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 mt-4">
                      <p>Note: Atlas Scientific EZO EC sensors have these calibration options:</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Single point: 1.413 mS/cm (1413 μS/cm) recommended</li>
                        <li>Dry calibration: ensure probe is clean and dry</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                {/* Calibration process */}
                {isCalibrating ? (
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">Calibrating EC Sensor</h2>
                    </div>
                    <div className="p-4">
                      <div className="mb-6 text-center">
                        <div className="mb-2">
                          <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                          <span className="text-xl ml-2">mS/cm</span>
                        </div>
                        <div className="text-gray-400">
                          <span>Voltage: {voltage !== null ? voltage : '--'} V</span>
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
                          <label className="block text-sm mb-2">Calibration Solution (mS/cm)</label>
                          <div className="flex justify-center">
                            <select 
                              className="bg-[#1e1e1e] border border-[#333333] rounded p-2 w-full max-w-xs"
                              value={bufferValue}
                              onChange={(e) => {
                                setBufferValue(parseFloat(e.target.value));
                                setStabilizing(false);
                                setStabilized(false);
                                setPreviousReadings([]);
                              }}
                            >
                              <option value={1.413}>1.413 mS/cm (1413 μS/cm)</option>
                              <option value={2.76}>2.76 mS/cm (2760 μS/cm)</option>
                              <option value={12.88}>12.88 mS/cm (12880 μS/cm)</option>
                            </select>
                          </div>
                        </div>
                        
                        <p className="text-center">
                          Place the EC probe in {bufferValue} mS/cm calibration solution.
                          Wait for the reading to stabilize.
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
                        EC (electrical conductivity) sensors require single-point calibration. Use a standardized 
                        calibration solution, typically 1.413 mS/cm, for accurate readings. Make sure to rinse the 
                        probe with distilled water before calibration.
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
                              Start EC Calibration
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
                      Reset EC Calibration Data
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
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

interface PhCalibration {
  lowPoint: CalibrationPoint;
  midPoint: CalibrationPoint;
  highPoint: CalibrationPoint;
  lastCalibrated: string | null;
  isCalibrated: boolean;
}

export default function PhCalibrationPage() {
  const [activeSection, setActiveSection] = useState("calibration");
  const { collapsed } = useSidebar();
  const router = useRouter();
  const [calibrationData, setCalibrationData] = useState<PhCalibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorReading, setSensorReading] = useState<number | null>(null);
  const [calibratingPoint, setCalibratingPoint] = useState<string | null>(null);
  const [sensorPolling, setSensorPolling] = useState(false);
  const [voltage, setVoltage] = useState<number | null>(null);
  const [stabilizing, setStabilizing] = useState(false);
  const [stabilized, setStabilized] = useState(false);
  const [previousReadings, setPreviousReadings] = useState<number[]>([]);
  const [calibrationStep, setCalibrationStep] = useState(0);
  
  // Fetch pH calibration data
  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        const response = await fetch('/api/calibration/ph');
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        const data = await response.json();
        setCalibrationData(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load pH calibration data');
        setLoading(false);
        console.error('Error loading pH calibration data:', err);
      }
    };
    
    fetchCalibration();
  }, []);
  
  // Simulate pH sensor reading with stabilization detection
  useEffect(() => {
    if (!sensorPolling) return;
    
    const interval = setInterval(() => {
      // In a real implementation, this would be an API call to get the current sensor reading
      // For now we'll simulate a realistic pH voltage
      const simulatedVoltage = Math.random() * 0.6 - 0.3 + (
        calibratingPoint === 'low' ? -0.4 : 
        calibratingPoint === 'mid' ? 0 : 
        calibratingPoint === 'high' ? 0.4 : 0
      );
      
      setVoltage(parseFloat(simulatedVoltage.toFixed(4)));
      
      // Convert voltage to pH (simple linear conversion, in reality would be more complex)
      const simulatedpH = 7.0 + simulatedVoltage * 3.5;
      const newReading = parseFloat(simulatedpH.toFixed(2));
      setSensorReading(newReading);
      
      // Add to previous readings for stabilization detection
      setPreviousReadings(prev => {
        const newReadings = [...prev, newReading].slice(-5); // Keep last 5 readings
        
        // Check if readings have stabilized (within 0.02 pH)
        if (newReadings.length === 5) {
          const isStable = newReadings.every(r => 
            Math.abs(r - newReadings[0]) < 0.02
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
            
            // Auto save if calibration has stabilized
            if (calibrationStep === 2) {
              saveCalibration();
            }
          }
        }
        
        return newReadings;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [sensorPolling, calibratingPoint, stabilizing, calibrationStep]);
  
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
    
    // Start appropriate calibration point based on step
    if (calibrationStep === 1) {
      // Step 1 complete - start mid point (pH 7.0) calibration
      startCalibration('mid');
    } else if (calibrationStep === 3) {
      // Step 3 complete - start low point (pH 4.0) calibration
      startCalibration('low');
    } else if (calibrationStep === 5) {
      // Step 5 complete - start high point (pH 10.0) calibration
      startCalibration('high');
    } else if (calibrationStep === 7) {
      // Calibration complete
      setCalibrationStep(0);
      cancelCalibration();
    }
  };
  
  // Start calibration for a specific point
  const startCalibration = (point: string) => {
    setCalibratingPoint(point);
    setSensorPolling(true);
  };
  
  // Save calibration data
  const saveCalibration = async () => {
    if (!calibratingPoint || sensorReading === null) return;
    
    // For Atlas Scientific EZO sensors, we don't need to store voltage directly
    // The EZO circuit handles the voltage-to-pH conversion internally
    try {
      setLoading(true);
      
      // For EZO pH sensors, the calibration command would be:
      // Mid point (pH 7): Cal,mid,7.0
      // Low point (pH 4): Cal,low,4.0
      // High point (pH 10): Cal,high,10.0
      // Here we're simulating this by sending the appropriate calibration point to our API
      
      const calibrationValue = 
        calibratingPoint === 'low' ? 4.0 : 
        calibratingPoint === 'mid' ? 7.0 : 
        calibratingPoint === 'high' ? 10.0 : 
        sensorReading;
      
      const response = await fetch('/api/calibration/ph', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          point: calibratingPoint,
          reading: calibrationValue,
          voltage: voltage || 0 // Keep voltage for backward compatibility, but EZO doesn't need it
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
        setCalibratingPoint(null);
        setSensorReading(null);
        setVoltage(null);
        setStabilizing(false);
        setStabilized(false);
        setPreviousReadings([]);
      } else {
        // Stop calibration in manual mode
        setSensorPolling(false);
        setCalibratingPoint(null);
        setSensorReading(null);
        setVoltage(null);
        
        alert(`${calibratingPoint.charAt(0).toUpperCase() + calibratingPoint.slice(1)} point calibrated successfully`);
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
    setCalibratingPoint(null);
    setSensorReading(null);
    setVoltage(null);
  };
  
  // Reset calibration
  const resetCalibration = async () => {
    if (!confirm('Are you sure you want to reset pH calibration data? This cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/calibration/ph', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Refresh calibration data
      const refreshResponse = await fetch('/api/calibration/ph');
      const data = await refreshResponse.json();
      setCalibrationData(data);
      alert('pH calibration data has been reset successfully');
    } catch (err) {
      setError('Failed to reset calibration data');
      console.error('Error resetting calibration data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Render guided calibration mode
  const renderGuidedCalibration = () => {
    // Step 1: Introduction
    if (calibrationStep === 1) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Guided pH Calibration</h2>
          </div>
          <div className="p-4">
            <h3 className="text-xl font-medium mb-4">Step 1: Preparation</h3>
            <ol className="list-decimal pl-5 mb-6 space-y-2">
              <li>Rinse your pH probe with distilled water and blot dry with a lint-free tissue.</li>
              <li>Prepare your calibration solutions: pH 7.0, pH 4.0, and pH 10.0 (optional).</li>
              <li>Make sure solutions are at room temperature.</li>
            </ol>
            <div className="text-center">
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Start with pH 7.0 Calibration
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 2: Mid point (pH 7.0) calibration
    if (calibrationStep === 2) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibrating Mid Point (pH 7.0)</h2>
          </div>
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mb-2">
                <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                <span className="text-xl ml-2">pH</span>
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
            
            <div className="space-y-4 text-center">
              <p>
                Place the pH probe in pH 7.0 buffer solution.
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
    
    // Step 3: Mid point confirmation
    if (calibrationStep === 3) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mid Point Calibrated</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center mb-4">
              <div className="text-green-400 mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <span className="text-xl">pH 7.0 Calibration Complete</span>
            </div>
            
            <p className="text-center mb-6">
              Rinse your pH probe thoroughly with distilled water and blot dry before continuing.
            </p>
            
            <div className="text-center">
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Continue with pH 4.0 Calibration
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 4: Low point (pH 4.0) calibration
    if (calibrationStep === 4) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibrating Low Point (pH 4.0)</h2>
          </div>
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mb-2">
                <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                <span className="text-xl ml-2">pH</span>
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
            
            <div className="space-y-4 text-center">
              <p>
                Place the pH probe in pH 4.0 buffer solution.
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
    
    // Step 5: Low point confirmation and option for high point
    if (calibrationStep === 5) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Low Point Calibrated</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center mb-4">
              <div className="text-green-400 mr-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <span className="text-xl">pH 4.0 Calibration Complete</span>
            </div>
            
            <p className="text-center mb-6">
              Your pH sensor is now calibrated with two points. For higher accuracy, you can
              optionally calibrate with pH 10.0 solution as well.
            </p>
            
            <div className="flex justify-center space-x-4">
              <button 
                className="btn btn-secondary"
                onClick={() => setCalibrationStep(7)}
              >
                Finish Calibration
              </button>
              <button 
                className="btn"
                onClick={nextCalibrationStep}
              >
                Continue with pH 10.0 (Optional)
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // Step 6: High point (pH 10.0) calibration
    if (calibrationStep === 6) {
      return (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Calibrating High Point (pH 10.0)</h2>
          </div>
          <div className="p-4">
            <div className="mb-6 text-center">
              <div className="mb-2">
                <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                <span className="text-xl ml-2">pH</span>
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
            
            <div className="space-y-4 text-center">
              <p>
                Place the pH probe in pH 10.0 buffer solution.
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
    
    // Step 7: Calibration complete
    if (calibrationStep === 7) {
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
              <span className="text-xl">pH Calibration Successfully Completed</span>
            </div>
            
            <p className="text-center mb-6">
              Your pH sensor is now fully calibrated and ready for accurate measurements.
              Remember to store your probe properly in storage solution when not in use.
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
          <h1 className="text-2xl font-bold mb-2">pH Sensor Calibration</h1>
          <p className="text-gray-400">
            Calibrate your pH sensor using standard buffer solutions (4.0, 7.0, and 10.0)
          </p>
        </div>

        {loading && !calibratingPoint ? (
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
                    
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="bg-[#1e1e1e] p-3 rounded">
                        <h3 className="font-medium mb-1 text-center">Low Point (pH 4.0)</h3>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400 text-sm">Status:</span>
                          <span className="text-sm">{calibrationData?.lowPoint.reading ? 'Calibrated' : 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Reading:</span>
                          <span className="text-sm">{calibrationData?.lowPoint.reading || 'Not set'}</span>
                        </div>
                      </div>
                      
                      <div className="bg-[#1e1e1e] p-3 rounded">
                        <h3 className="font-medium mb-1 text-center">Mid Point (pH 7.0)</h3>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400 text-sm">Status:</span>
                          <span className="text-sm">{calibrationData?.midPoint.reading ? 'Calibrated' : 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Reading:</span>
                          <span className="text-sm">{calibrationData?.midPoint.reading || 'Not set'}</span>
                        </div>
                      </div>
                      
                      <div className="bg-[#1e1e1e] p-3 rounded">
                        <h3 className="font-medium mb-1 text-center">High Point (pH 10.0)</h3>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400 text-sm">Status:</span>
                          <span className="text-sm">{calibrationData?.highPoint.reading ? 'Calibrated' : 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Reading:</span>
                          <span className="text-sm">{calibrationData?.highPoint.reading || 'Not set'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 mt-4">
                      <p>Note: Atlas Scientific EZO pH sensors require calibration in the following order:</p>
                      <ol className="list-decimal pl-5 mt-2 space-y-1">
                        <li>Mid point (pH 7.0) first</li>
                        <li>Then low point (pH 4.0) and/or high point (pH 10.0)</li>
                      </ol>
                    </div>
                  </div>
                </div>
                
                {/* Calibration process */}
                {calibratingPoint ? (
                  <div className="card">
                    <div className="card-header">
                      <h2 className="card-title">
                        Calibrating {calibratingPoint === 'low' ? 'Low Point (pH 4.0)' : 
                                    calibratingPoint === 'mid' ? 'Mid Point (pH 7.0)' : 
                                    'High Point (pH 10.0)'}
                      </h2>
                    </div>
                    <div className="p-4">
                      <div className="mb-6 text-center">
                        <div className="mb-2">
                          <span className="text-5xl font-bold">{sensorReading !== null ? sensorReading : '--'}</span>
                          <span className="text-xl ml-2">pH</span>
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
                      
                      <div className="space-y-4 text-center">
                        <p>
                          Place the pH probe in {calibratingPoint === 'low' ? 'pH 4.0' : 
                                              calibratingPoint === 'mid' ? 'pH 7.0' : 
                                              'pH 10.0'} buffer solution. 
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
                            {stabilized ? 'Save Calibration Point' : 'Waiting for Stabilization...'}
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
                        pH sensors typically require calibration with 2 or 3 points for accuracy. Use standard buffer solutions 
                        of pH 4.0, 7.0, and 10.0 for best results. Rinse probe with distilled water between calibrations.
                      </p>
                      
                      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                        <div className="flex-1">
                          <h3 className="font-medium mb-2 text-center">Guided Calibration</h3>
                          <p className="text-sm text-gray-400 mb-4 text-center">
                            Recommended for beginners. Step-by-step process with automatic detection.
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
                            Calibrate specific points individually.
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <button 
                              className="btn"
                              onClick={() => startCalibration('mid')}
                            >
                              pH 7.0
                            </button>
                            <button 
                              className="btn"
                              onClick={() => startCalibration('low')}
                              disabled={!calibrationData?.midPoint.reading}
                            >
                              pH 4.0
                            </button>
                            <button 
                              className="btn"
                              onClick={() => startCalibration('high')}
                              disabled={!calibrationData?.midPoint.reading}
                            >
                              pH 10.0
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Reset button - only show if not currently calibrating */}
                {!calibratingPoint && (
                  <div className="text-center mt-4">
                    <button 
                      className="btn btn-secondary bg-red-800 hover:bg-red-700"
                      onClick={resetCalibration}
                      disabled={loading}
                    >
                      Reset pH Calibration Data
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
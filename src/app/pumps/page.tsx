"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { usePumpData, NutrientAssignment } from "../hooks/usePumpData";
import { useNutrientData, FlatProduct } from "../hooks/useNutrientData";
import { PumpName } from "../lib/pumps";

export default function PumpsPage() {
  const [activeSection, setActiveSection] = useState("pumps");
  const [calibrationAmount, setCalibrationAmount] = useState(50);
  const [manualDoseAmount, setManualDoseAmount] = useState(10);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(1);
  const { collapsed } = useSidebar();
  const [isAddingPump, setIsAddingPump] = useState(false);
  const [isSelectingNutrient, setIsSelectingNutrient] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  
  // Use the pump data hook to get real-time data
  const { 
    data: pumpData, 
    isLoading: pumpsLoading, 
    error: pumpError, 
    refresh: refreshPumps,
    activatePump,
    deactivatePump,
    dispensePump,
    assignNutrientToPump
  } = usePumpData(5000);
  
  // Use the nutrient data hook
  const {
    products,
    isLoading: nutrientsLoading,
    error: nutrientsError,
    refresh: refreshNutrients
  } = useNutrientData();
  
  // State for the selected pump
  const [selectedPump, setSelectedPump] = useState<string | null>(null);
  
  // Set the first pump as selected when data loads
  useEffect(() => {
    if (pumpData && pumpData.pumpStatus && pumpData.pumpStatus.length > 0 && !selectedPump) {
      setSelectedPump(pumpData.pumpStatus[0].name);
    }
  }, [pumpData, selectedPump]);
  
  // Get the currently selected pump from the pump data
  const currentPump = pumpData?.pumpStatus?.find(pump => pump.name === selectedPump) || null;

  const startCalibration = () => {
    setIsCalibrating(true);
    setCalibrationStep(1);
  };

  const completeCalibration = async () => {
    if (!currentPump) return;
    
    // In a real implementation, this would store the calibration result
    // For now, we'll just record a test dispense to simulate calibration
    try {
      await dispensePump(currentPump.name as PumpName, calibrationAmount, calibrationAmount / 10);
      setIsCalibrating(false);
      setCalibrationStep(1);
    } catch (error) {
      console.error("Calibration failed:", error);
    }
  }

  const openAddPumpModal = () => {
    setIsAddingPump(true);
  };

  const closeAddPumpModal = () => {
    setIsAddingPump(false);
  };

  const handlePumpActivation = async () => {
    if (!currentPump) return;
    
    if (currentPump.active) {
      await deactivatePump(currentPump.name as PumpName);
    } else {
      await activatePump(currentPump.name as PumpName);
    }
  };
  
  const handleDoseNow = async () => {
    if (!currentPump) return;
    await dispensePump(currentPump.name as PumpName, manualDoseAmount, 2.0); // 2.0 ml/s flow rate
  };
  
  const handleQuickDose = async (amount: number) => {
    if (!currentPump) return;
    await dispensePump(currentPump.name as PumpName, amount, 2.0); // 2.0 ml/s flow rate
  };

  // This functionality would need to be implemented on the server
  const handleAddPump = () => {
    closeAddPumpModal();
    // Note: In a real implementation, this would call an API to add a new pump
    alert("Adding new pumps would require hardware configuration. This is just a UI placeholder.");
  };
  
  // Open nutrient selection modal
  const openNutrientSelectionModal = () => {
    // Don't open modal for pH Up/Down pumps
    if (currentPump && (currentPump.name === "pH Up" || currentPump.name === "pH Down")) {
      return;
    }
    
    setIsSelectingNutrient(true);
    refreshNutrients(); // Refresh nutrient data to ensure it's up to date
  };
  
  // Close nutrient selection modal
  const closeNutrientSelectionModal = () => {
    setIsSelectingNutrient(false);
    setSelectedBrandId(null);
    setSelectedProductId(null);
  };
  
  // Assign nutrient to pump
  const handleAssignNutrient = async (nutrient: FlatProduct) => {
    if (!currentPump) return;
    
    const nutrientData: NutrientAssignment = {
      productId: nutrient.productId,
      brandId: nutrient.brandId,
      brandName: nutrient.brandName,
      productName: nutrient.name,
      npk: nutrient.npk
    };
    
    await assignNutrientToPump(currentPump.name as PumpName, nutrientData);
    setIsSelectingNutrient(false);
  };
  
  // Remove nutrient from pump
  const handleRemoveNutrient = async () => {
    if (!currentPump) return;
    
    await assignNutrientToPump(currentPump.name as PumpName, null);
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Pump Control</h1>
          <div className="flex items-center">
            <button className="btn" onClick={refreshPumps}>Refresh</button>
            <button className="btn ml-3" onClick={openAddPumpModal}>Add New Pump</button>
          </div>
        </div>

        {/* Loading state */}
        {pumpsLoading && !pumpData && (
          <div className="card">
            <div className="animate-pulse text-center py-12">
              <p>Loading pump data...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {pumpError && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-8 text-red-200">
            <div className="flex items-start">
              <svg className="w-6 h-6 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Pump Error</h3>
                <p>{pumpError.message}</p>
              </div>
            </div>
          </div>
        )}

        {pumpData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pump List */}
            <div className="lg:col-span-1">
              <div className="card mb-6">
                <h2 className="card-title mb-4">Available Pumps</h2>
                <div className="space-y-3">
                  {pumpData.pumpStatus.map((pump) => (
                    <div 
                      key={pump.name}
                      onClick={() => setSelectedPump(pump.name)}
                      className={`p-3 rounded cursor-pointer flex justify-between items-center ${selectedPump === pump.name ? 'bg-[#2a2a2a]' : 'hover:bg-[#1a1a1a]'} border border-[#333333]`}
                    >
                      <div className="flex items-center">
                        <div className={`status-indicator ${pump.active ? 'status-good' : ''} mr-2`}></div>
                        <div>
                          {/* Show the appropriate display name based on pump type */}
                          {pump.name === "pH Up" && (
                            <span>pH Up</span>
                          )}
                          {pump.name === "pH Down" && (
                            <span>pH Down</span>
                          )}
                          {pump.name !== "pH Up" && pump.name !== "pH Down" && pump.nutrient && (
                            <span>{pump.nutrient.productName}</span>
                          )}
                          {pump.name !== "pH Up" && pump.name !== "pH Down" && !pump.nutrient && (
                            <span>{pump.name}</span>
                          )}

                          {/* Show pump ID/identifier as secondary label for normal pumps */}
                          {pump.name !== "pH Up" && pump.name !== "pH Down" && (
                            <span className="block text-xs text-gray-400">
                              {pump.nutrient ? `Pump: ${pump.name}` : "No nutrient assigned"}
                            </span>
                          )}
                          {/* Show solution type for pH pumps */}
                          {pump.name === "pH Up" && (
                            <span className="block text-xs text-gray-400">pH Up Solution</span>
                          )}
                          {pump.name === "pH Down" && (
                            <span className="block text-xs text-gray-400">pH Down Solution</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-gray-400">{pump.active ? 'Active' : 'Idle'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pump Details and Controls */}
            <div className="lg:col-span-2">
              {!isCalibrating && currentPump ? (
                <>
                  {/* Pump Details */}
                  <div className="card mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        {/* Show the appropriate display name based on pump type */}
                        {currentPump.name === "pH Up" || currentPump.name === "pH Down" ? (
                          <h2 className="card-title">{currentPump.name}</h2>
                        ) : currentPump.nutrient ? (
                          <h2 className="card-title">{currentPump.nutrient.productName}</h2>
                        ) : (
                          <h2 className="card-title">{currentPump.name}</h2>
                        )}
                        
                        {/* Always show the pump name as secondary information if it has a nutrient */}
                        {currentPump.name !== "pH Up" && currentPump.name !== "pH Down" && currentPump.nutrient && (
                          <span className="text-sm text-gray-400 block">Pump: {currentPump.name}</span>
                        )}
                        
                        <span className="text-sm text-gray-400">
                          Last activated: {currentPump.lastActivated ? new Date(currentPump.lastActivated).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-sm ${currentPump.active ? 'bg-green-800 text-green-100' : 'bg-gray-800 text-gray-300'}`}>
                        {currentPump.active ? 'Active' : 'Idle'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-[#1a1a1a] p-3 rounded">
                        <span className="text-sm text-gray-400 block">Flow Rate</span>
                        <span className="text-xl font-semibold">
                          {currentPump.flowRate || 'Not calibrated'} {currentPump.flowRate ? 'ml/s' : ''}
                        </span>
                      </div>
                      <div className="bg-[#1a1a1a] p-3 rounded">
                        <span className="text-sm text-gray-400 block">Status</span>
                        <span className="text-xl font-semibold">
                          {currentPump.active ? 'Running' : 'Stopped'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Nutrient Information */}
                    <div className="bg-[#1a1a1a] p-3 rounded mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400 block">Assigned Nutrient</span>
                        {currentPump.name === "pH Up" || currentPump.name === "pH Down" ? (
                          <span className="text-xs px-2 py-1 bg-gray-800 rounded-md">Dedicated Pump</span>
                        ) : (
                          <button 
                            className="btn btn-sm"
                            onClick={openNutrientSelectionModal}
                          >
                            {currentPump.nutrient ? 'Change' : 'Assign'}
                          </button>
                        )}
                      </div>
                      {currentPump.name === "pH Up" ? (
                        <div className="mt-2">
                          <div className="flex items-center">
                            <div>
                              <span className="font-semibold block">pH Up Solution</span>
                              <span className="text-sm text-gray-400">Dedicated pH increasing solution</span>
                            </div>
                          </div>
                        </div>
                      ) : currentPump.name === "pH Down" ? (
                        <div className="mt-2">
                          <div className="flex items-center">
                            <div>
                              <span className="font-semibold block">pH Down Solution</span>
                              <span className="text-sm text-gray-400">Dedicated pH decreasing solution</span>
                            </div>
                          </div>
                        </div>
                      ) : currentPump.nutrient ? (
                        <div className="mt-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-semibold block">{currentPump.nutrient.productName}</span>
                              <span className="text-sm text-gray-400">{currentPump.nutrient.brandName} • NPK: {currentPump.nutrient.npk}</span>
                            </div>
                            <button 
                              className="btn btn-sm btn-danger"
                              onClick={handleRemoveNutrient}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="block mt-2 italic text-gray-400">No nutrient assigned</span>
                      )}
                    </div>

                    <div className="flex space-x-3">
                      <button 
                        className="btn flex-1" 
                        onClick={startCalibration}
                      >
                        Calibrate
                      </button>
                      <button 
                        className="btn btn-secondary flex-1"
                        onClick={() => alert("This functionality would require a server-side implementation")}
                      >
                        Rename
                      </button>
                    </div>
                  </div>

                  {/* Manual Dosing */}
                  <div className="card">
                    <h2 className="card-title mb-4">Manual Dosing</h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm mb-2">Amount (ml)</label>
                        <div className="flex">
                          <input 
                            type="number" 
                            className="flex-1 bg-[#1e1e1e] border border-[#333333] rounded-l p-2"
                            value={manualDoseAmount}
                            onChange={(e) => setManualDoseAmount(Number(e.target.value))}
                            min="1"
                            max="100"
                          />
                          <button className="btn rounded-l-none" onClick={handleDoseNow}>Dose Now</button>
                        </div>
                      </div>
                      
                      <div className="border-t border-[#333333] pt-4">
                        <h3 className="text-sm font-medium mb-2">Quick Doses</h3>
                        <div className="grid grid-cols-4 gap-2">
                          <button className="btn btn-secondary" onClick={() => handleQuickDose(5)}>5ml</button>
                          <button className="btn btn-secondary" onClick={() => handleQuickDose(10)}>10ml</button>
                          <button className="btn btn-secondary" onClick={() => handleQuickDose(25)}>25ml</button>
                          <button className="btn btn-secondary" onClick={() => handleQuickDose(50)}>50ml</button>
                        </div>
                      </div>
                      
                      <div className="border-t border-[#333333] pt-4">
                        <h3 className="text-sm font-medium mb-2">Manual Control</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            className={`btn ${currentPump.active ? 'btn-secondary' : ''}`}
                            onClick={handlePumpActivation}
                            disabled={currentPump.active}
                          >
                            Start Pump
                          </button>
                          <button 
                            className={`btn ${!currentPump.active ? 'btn-secondary' : 'btn-danger'}`}
                            onClick={handlePumpActivation}
                            disabled={!currentPump.active}
                          >
                            Stop Pump
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : isCalibrating && currentPump ? (
                /* Calibration Wizard */
                <div className="card">
                  <h2 className="card-title">Calibrating: {currentPump.name}</h2>
                  
                  <div className="mt-6">
                    {calibrationStep === 1 && (
                      <div className="space-y-4">
                        <p>Step 1: Prepare a graduated cylinder or measuring container.</p>
                        <div>
                          <label className="block text-sm mb-2">Calibration Amount (ml)</label>
                          <input 
                            type="number" 
                            className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2 mb-4"
                            value={calibrationAmount}
                            onChange={(e) => setCalibrationAmount(Number(e.target.value))}
                            min="10"
                            max="100"
                          />
                        </div>
                        <div className="flex justify-between">
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => setIsCalibrating(false)}
                          >
                            Cancel
                          </button>
                          <button 
                            className="btn" 
                            onClick={() => setCalibrationStep(2)}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {calibrationStep === 2 && (
                      <div className="space-y-4">
                        <p>Step 2: Position the output tube into the measuring container.</p>
                        <p>When ready, click "Run Test" to dispense {calibrationAmount}ml of liquid.</p>
                        <div className="flex justify-between">
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => setCalibrationStep(1)}
                          >
                            Back
                          </button>
                          <button 
                            className="btn" 
                            onClick={() => setCalibrationStep(3)}
                          >
                            Run Test
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {calibrationStep === 3 && (
                      <div className="space-y-4">
                        <p>Step 3: Enter the actual amount dispensed as measured in your container.</p>
                        <div>
                          <label className="block text-sm mb-2">Measured Amount (ml)</label>
                          <input 
                            type="number" 
                            className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2 mb-4"
                            defaultValue={calibrationAmount}
                            min="1"
                            max="200"
                          />
                        </div>
                        <div className="flex justify-between">
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => setCalibrationStep(2)}
                          >
                            Back
                          </button>
                          <button 
                            className="btn" 
                            onClick={completeCalibration}
                          >
                            Complete Calibration
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card p-8 text-center">
                  <p>Select a pump from the list to view details and controls</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Add New Pump Modal */}
        {isAddingPump && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">Add New Pump</h2>
              
              {(() => {
                // Find the next available pump number
                const existingPumpNumbers = pumpData?.pumpStatus
                  .filter(p => p.name.startsWith('Pump '))
                  .map(p => parseInt(p.name.replace('Pump ', '')))
                  .sort((a, b) => a - b) || [];
                
                // Find the first gap or add to the end
                let nextPumpNumber = 1;
                for (const num of existingPumpNumbers) {
                  if (num !== nextPumpNumber) break;
                  nextPumpNumber++;
                }
                
                const nextPumpName = `Pump ${nextPumpNumber}`;
                
                return (
                  <div>
                    <p className="mb-6">
                      A new pump will be added as: <span className="font-bold">{nextPumpName}</span>
                    </p>
                    <p className="text-sm text-gray-400 mb-6">
                      Pumps are numbered automatically in sequence.
                    </p>
                    <div className="flex justify-end space-x-3">
                      <button 
                        className="btn btn-secondary" 
                        onClick={closeAddPumpModal}
                      >
                        Cancel
                      </button>
                      <button 
                        className="btn" 
                        onClick={handleAddPump}
                      >
                        Add Pump
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        
        {/* Nutrient Selection Modal */}
        {isSelectingNutrient && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg max-h-[80vh] flex flex-col">
              <h2 className="text-xl font-bold mb-4">Select Nutrient for {currentPump?.name}</h2>
              
              {nutrientsLoading ? (
                <div className="animate-pulse text-center py-8 flex-grow">
                  <p>Loading nutrients...</p>
                </div>
              ) : nutrientsError ? (
                <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-4 text-red-200">
                  <p>Error loading nutrients: {nutrientsError.message}</p>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 flex-grow">
                  <p className="mb-4">No nutrients available</p>
                  <Link href="/nutrients" className="btn" onClick={() => setIsSelectingNutrient(false)}>
                    Go to Nutrient Database
                  </Link>
                </div>
              ) : (
                <div className="overflow-y-auto flex-grow">
                  {/* Brand Selection Dropdown */}
                  <div className="mb-4">
                    <label className="block text-sm mb-2 font-medium">Brand</label>
                    <select
                      className="w-full bg-[#121212] border border-[#333333] rounded-md p-3 text-base"
                      value={selectedBrandId || ""}
                      onChange={(e) => {
                        const brandId = e.target.value ? parseInt(e.target.value) : null;
                        setSelectedBrandId(brandId);
                        setSelectedProductId(null);
                      }}
                    >
                      <option value="">-- Select Brand --</option>
                      {Array.from(new Set(products.map(p => p.brandId))).map(brandId => {
                        const brand = products.find(p => p.brandId === brandId);
                        return (
                          <option key={brandId} value={brandId}>
                            {brand?.brandName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Product Selection Dropdown */}
                  {selectedBrandId && (
                    <div className="mb-6">
                      <label className="block text-sm mb-2 font-medium">Product</label>
                      <select
                        className="w-full bg-[#121212] border border-[#333333] rounded-md p-3 text-base"
                        value={selectedProductId || ""}
                        onChange={(e) => {
                          const productId = e.target.value ? parseInt(e.target.value) : null;
                          setSelectedProductId(productId);
                        }}
                      >
                        <option value="">-- Select Product --</option>
                        {products
                          .filter(p => p.brandId === selectedBrandId)
                          .map(product => (
                            <option key={product.productId} value={product.productId}>
                              {product.name} ({product.npk})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Selected Product Information */}
                  {selectedBrandId && selectedProductId && (
                    <div className="bg-[#1a1a1a] p-4 rounded-md mb-6">
                      {(() => {
                        const selectedProduct = products.find(
                          p => p.brandId === selectedBrandId && p.productId === selectedProductId
                        );
                        
                        if (!selectedProduct) return null;
                        
                        return (
                          <div>
                            <h3 className="font-medium mb-3 text-lg">{selectedProduct.name}</h3>
                            <p className="mb-1"><span className="text-gray-400">Brand:</span> {selectedProduct.brandName}</p>
                            <p className="mb-1"><span className="text-gray-400">NPK:</span> {selectedProduct.npk}</p>
                            <p className="mb-4"><span className="text-gray-400">Description:</span> {selectedProduct.description}</p>
                            <button 
                              className="btn w-full" 
                              onClick={() => handleAssignNutrient(selectedProduct)}
                            >
                              Assign to Pump
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex justify-end mt-4 pt-4 border-t border-[#333333]">
                <button 
                  className="btn btn-secondary" 
                  onClick={closeNutrientSelectionModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
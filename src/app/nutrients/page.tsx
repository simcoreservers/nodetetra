"use client";

import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useNutrientData, NutrientBrand, NutrientProduct } from "../hooks/useNutrientData";

export default function NutrientsPage() {
  const [activeSection, setActiveSection] = useState("nutrients");
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<NutrientBrand | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<NutrientProduct | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: "",
    npk: "",
    description: ""
  });
  const { collapsed } = useSidebar();
  
  // Use the nutrient data hook
  const { 
    nutrients, 
    isLoading, 
    error, 
    refresh,
    addBrand,
    updateBrand,
    deleteBrand,
    addProduct,
    updateProduct,
    deleteProduct,
    restoreDefaults,
    isRestoringDefaults
  } = useNutrientData();

  // When nutrients load, select the first brand if available
  useEffect(() => {
    if (nutrients && nutrients.length > 0 && !selectedBrand) {
      setSelectedBrand(nutrients[0]);
    }
  }, [nutrients, selectedBrand]);

  // Reset selected product when brand changes
  useEffect(() => {
    setSelectedProduct(null);
  }, [selectedBrand]);

  // Handle brand selection
  const handleSelectBrand = (brand: NutrientBrand) => {
    // Force a complete refresh of the brand data
    // This ensures we're getting a fresh copy of the brand from the nutrients array
    const freshBrand = nutrients.find(b => b.id === brand.id) || brand;
    setSelectedBrand(freshBrand);
    setSelectedProduct(null);
  };

  // Handle product selection
  const handleSelectProduct = (product: NutrientProduct) => {
    setSelectedProduct(product);
    setProductFormData({
      name: product.name,
      npk: product.npk,
      description: product.description
    });
  };

  // Open add brand modal
  const handleOpenAddBrand = () => {
    setNewBrandName("");
    setIsAddingBrand(true);
  };

  // Open edit brand modal
  const handleOpenEditBrand = () => {
    if (!selectedBrand) return;
    setNewBrandName(selectedBrand.brand);
    setIsEditingBrand(true);
  };

  // Open add product modal
  const handleOpenAddProduct = () => {
    setProductFormData({
      name: "",
      npk: "",
      description: ""
    });
    setIsAddingProduct(true);
  };

  // Open edit product modal
  const handleOpenEditProduct = () => {
    if (!selectedProduct) return;
    setIsEditingProduct(true);
  };

  // Handle add brand submit
  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    
    try {
      await addBrand(newBrandName);
      setIsAddingBrand(false);
    } catch (err) {
      console.error("Failed to add brand:", err);
      alert(`Failed to add brand: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle edit brand submit
  const handleEditBrand = async () => {
    if (!selectedBrand || !newBrandName.trim()) return;
    
    try {
      await updateBrand(selectedBrand.id, newBrandName);
      setIsEditingBrand(false);
    } catch (err) {
      console.error("Failed to update brand:", err);
      alert(`Failed to update brand: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle delete brand
  const handleDeleteBrand = async () => {
    if (!selectedBrand) return;
    
    if (!confirm(`Are you sure you want to delete "${selectedBrand.brand}" and all its products?`)) {
      return;
    }
    
    try {
      await deleteBrand(selectedBrand.id);
      setSelectedBrand(nutrients.length > 1 ? nutrients[0] : null);
    } catch (err) {
      console.error("Failed to delete brand:", err);
      alert(`Failed to delete brand: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle add product submit
  const handleAddProduct = async () => {
    if (!selectedBrand) return;
    if (!productFormData.name.trim() || !productFormData.npk.trim()) return;
    
    try {
      await addProduct(
        selectedBrand.id,
        productFormData.name,
        productFormData.npk,
        productFormData.description
      );
      setIsAddingProduct(false);
    } catch (err) {
      console.error("Failed to add product:", err);
      alert(`Failed to add product: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle edit product submit
  const handleEditProduct = async () => {
    if (!selectedBrand || !selectedProduct) return;
    if (!productFormData.name.trim() || !productFormData.npk.trim()) return;
    
    try {
      await updateProduct(
        selectedBrand.id,
        selectedProduct.id,
        productFormData.name,
        productFormData.npk,
        productFormData.description
      );
      setIsEditingProduct(false);
    } catch (err) {
      console.error("Failed to update product:", err);
      alert(`Failed to update product: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle delete product
  const handleDeleteProduct = async () => {
    if (!selectedBrand || !selectedProduct) return;
    
    if (!confirm(`Are you sure you want to delete "${selectedProduct.name}"?`)) {
      return;
    }
    
    try {
      await deleteProduct(selectedBrand.id, selectedProduct.id);
      setSelectedProduct(null);
    } catch (err) {
      console.error("Failed to delete product:", err);
      alert(`Failed to delete product: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Handle restore defaults
  const handleRestoreDefaults = async () => {
    if (!confirm('This will add default nutrient brands and products while preserving your custom entries. Continue?')) {
      return;
    }
    
    try {
      const result = await restoreDefaults();
      alert(`Successfully added ${result.addedBrands} brands and ${result.addedProducts} products from defaults.`);
    } catch (err) {
      console.error("Failed to restore defaults:", err);
      alert(`Failed to restore defaults: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Nutrient Database</h1>
          <div className="flex gap-3">
            <button 
              onClick={handleRestoreDefaults}
              disabled={isRestoringDefaults}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md flex items-center"
            >
              {isRestoringDefaults ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Restoring...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Restore Default Nutrients
                </>
              )}
            </button>
            <button
              onClick={handleOpenAddBrand}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
            >
              Add Brand
            </button>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && nutrients.length === 0 && (
          <div className="card">
            <div className="animate-pulse text-center py-12">
              <p>Loading nutrient data...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-8 text-red-200">
            <div className="flex items-start">
              <svg className="w-6 h-6 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Error</h3>
                <p>{error.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && nutrients.length === 0 && (
          <div className="card">
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold mb-2">No Nutrient Brands Available</h3>
              <p className="text-gray-400 mb-6">Add a new nutrient brand to get started</p>
              <button className="btn" onClick={handleOpenAddBrand}>Add New Brand</button>
            </div>
          </div>
        )}

        {/* Content area - Two-column layout */}
        {!isLoading && !error && nutrients.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Brand List */}
            <div className="lg:col-span-1">
              <div className="card mb-6">
                <h2 className="card-title mb-4">Nutrient Brands</h2>
                <div className="space-y-3">
                  {nutrients.map((brand) => (
                    <div 
                      key={brand.id}
                      onClick={() => handleSelectBrand(brand)}
                      className={`p-3 rounded cursor-pointer flex justify-between items-center ${selectedBrand?.id === brand.id ? 'bg-[#2a2a2a]' : 'hover:bg-[#1a1a1a]'} border border-[#333333]`}
                    >
                      <div className="flex items-center">
                        <span>{brand.brand}</span>
                      </div>
                      <span className="text-sm text-gray-400">{brand.products.length} products</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Brand Actions */}
              {selectedBrand && (
                <div className="card">
                  <h2 className="card-title mb-4">Brand Actions</h2>
                  <div className="space-y-3">
                    <button 
                      className="btn w-full"
                      onClick={handleOpenEditBrand}
                    >
                      Edit Brand
                    </button>
                    <button 
                      className="btn btn-danger w-full"
                      onClick={handleDeleteBrand}
                    >
                      Delete Brand
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Products List and Details */}
            {selectedBrand && (
              <div className="lg:col-span-2">
                <div className="card mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="card-title">{selectedBrand.brand} Products</h2>
                    <button className="btn btn-sm" onClick={handleOpenAddProduct}>Add Product</button>
                  </div>
                  
                  {selectedBrand.products.length === 0 ? (
                    <div className="text-center py-8 bg-[#1a1a1a] rounded">
                      <p className="text-gray-400 mb-3">No products available for this brand</p>
                      <button className="btn btn-sm" onClick={handleOpenAddProduct}>Add First Product</button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-[#1a1a1a]">
                            <th className="p-3 rounded-tl">Name</th>
                            <th className="p-3">NPK Values</th>
                            <th className="p-3 rounded-tr">Description</th>
                          </tr>
                        </thead>
                        <tbody key={`brand-${selectedBrand.id}-products`}>
                          {selectedBrand.products.map((product) => (
                            <tr 
                              key={`product-${product.id}`} 
                              onClick={() => handleSelectProduct(product)}
                              className={`cursor-pointer border-b border-[#333333] hover:bg-[#1a1a1a] ${selectedProduct?.id === product.id ? 'bg-[#2a2a2a] hover:bg-[#2a2a2a]' : ''}`}
                            >
                              <td className="p-3">{product.name}</td>
                              <td className="p-3">{product.npk}</td>
                              <td className="p-3 max-w-xs truncate">{product.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                
                {/* Product Details */}
                {selectedProduct && (
                  <div className="card">
                    <h2 className="card-title mb-4">Product Details</h2>
                    
                    <div className="mb-4">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-[#1a1a1a] p-3 rounded">
                          <span className="text-sm text-gray-400 block">Name</span>
                          <span className="text-lg font-semibold">{selectedProduct.name}</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-3 rounded">
                          <span className="text-sm text-gray-400 block">NPK Values</span>
                          <span className="text-lg font-semibold">{selectedProduct.npk}</span>
                        </div>
                      </div>
                      
                      <div className="bg-[#1a1a1a] p-3 rounded mb-4">
                        <span className="text-sm text-gray-400 block">Description</span>
                        <span className="block">{selectedProduct.description || 'No description provided'}</span>
                      </div>
                      
                      <div className="flex space-x-3">
                        <button 
                          className="btn flex-1"
                          onClick={handleOpenEditProduct}
                        >
                          Edit Product
                        </button>
                        <button 
                          className="btn btn-danger flex-1"
                          onClick={handleDeleteProduct}
                        >
                          Delete Product
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Brand Modal */}
        {isAddingBrand && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">Add New Brand</h2>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Brand Name</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Enter brand name"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsAddingBrand(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={handleAddBrand}
                  disabled={!newBrandName.trim()}
                >
                  Add Brand
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Brand Modal */}
        {isEditingBrand && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">Edit Brand</h2>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Brand Name</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Enter brand name"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsEditingBrand(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={handleEditBrand}
                  disabled={!newBrandName.trim()}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Product Modal */}
        {isAddingProduct && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">Add New Product</h2>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Product Name</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.name}
                  onChange={(e) => setProductFormData({...productFormData, name: e.target.value})}
                  placeholder="Enter product name"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">NPK Values (e.g., 5-2-3)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.npk}
                  onChange={(e) => setProductFormData({...productFormData, npk: e.target.value})}
                  placeholder="Enter NPK values"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Description (optional)</label>
                <textarea 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.description}
                  onChange={(e) => setProductFormData({...productFormData, description: e.target.value})}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsAddingProduct(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={handleAddProduct}
                  disabled={!productFormData.name.trim() || !productFormData.npk.trim()}
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Product Modal */}
        {isEditingProduct && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-[#1e1e1e] w-full max-w-md p-6 rounded-md shadow-lg">
              <h2 className="text-xl font-bold mb-4">Edit Product</h2>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Product Name</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.name}
                  onChange={(e) => setProductFormData({...productFormData, name: e.target.value})}
                  placeholder="Enter product name"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">NPK Values (e.g., 5-2-3)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.npk}
                  onChange={(e) => setProductFormData({...productFormData, npk: e.target.value})}
                  placeholder="Enter NPK values"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm mb-2">Description (optional)</label>
                <textarea 
                  className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                  value={productFormData.description}
                  onChange={(e) => setProductFormData({...productFormData, description: e.target.value})}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setIsEditingProduct(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={handleEditProduct}
                  disabled={!productFormData.name.trim() || !productFormData.npk.trim()}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
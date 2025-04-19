"use client";

import { useState, useEffect, useCallback } from 'react';

export interface NutrientProduct {
  id: number;
  name: string;
  npk: string;
  description: string;
}

export interface NutrientBrand {
  id: number;
  brand: string;
  products: NutrientProduct[];
}

export interface FlatProduct {
  productId: number;
  brandId: number;
  brandName: string;
  name: string;
  npk: string;
  description: string;
}

export function useNutrientData(refreshInterval: number = 0) {
  const [nutrients, setNutrients] = useState<NutrientBrand[]>([]);
  const [products, setProducts] = useState<FlatProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRestoringDefaults, setIsRestoringDefaults] = useState(false);

  // Fetch all nutrient brands and their products
  const fetchNutrients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/nutrients');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch nutrients: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setNutrients(data.nutrients || []);
    } catch (err) {
      console.error('Error fetching nutrients:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch all products in a flat list format
  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/nutrients?productsOnly=true');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manually refresh data
  const refresh = useCallback(async () => {
    await fetchNutrients();
    await fetchProducts();
  }, [fetchNutrients, fetchProducts]);

  // Add a new brand
  const addBrand = useCallback(async (brandName: string): Promise<NutrientBrand> => {
    try {
      const response = await fetch('/api/nutrients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addBrand',
          brandName
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add brand: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh data after adding a brand
      await refresh();
      
      return data.brand;
    } catch (err) {
      console.error('Error adding brand:', err);
      throw err;
    }
  }, [refresh]);

  // Update a brand
  const updateBrand = useCallback(async (brandId: number, brandName: string): Promise<NutrientBrand> => {
    try {
      const response = await fetch('/api/nutrients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateBrand',
          brandId,
          brandName
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update brand: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh data after updating a brand
      await refresh();
      
      return data.brand;
    } catch (err) {
      console.error('Error updating brand:', err);
      throw err;
    }
  }, [refresh]);

  // Delete a brand
  const deleteBrand = useCallback(async (brandId: number): Promise<void> => {
    try {
      const response = await fetch(`/api/nutrients?action=deleteBrand&brandId=${brandId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete brand: ${response.status}`);
      }
      
      // Refresh data after deleting a brand
      await refresh();
    } catch (err) {
      console.error('Error deleting brand:', err);
      throw err;
    }
  }, [refresh]);

  // Add a new product to a brand
  const addProduct = useCallback(async (
    brandId: number, 
    productName: string, 
    npk: string, 
    description: string = ''
  ): Promise<NutrientProduct> => {
    try {
      const response = await fetch('/api/nutrients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addProduct',
          brandId,
          productName,
          npk,
          description
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add product: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh data after adding a product
      await refresh();
      
      return data.product;
    } catch (err) {
      console.error('Error adding product:', err);
      throw err;
    }
  }, [refresh]);

  // Update a product
  const updateProduct = useCallback(async (
    brandId: number,
    productId: number,
    productName: string,
    npk: string,
    description: string = ''
  ): Promise<NutrientProduct> => {
    try {
      const response = await fetch('/api/nutrients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProduct',
          brandId,
          productId,
          productName,
          npk,
          description
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update product: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh data after updating a product
      await refresh();
      
      return data.product;
    } catch (err) {
      console.error('Error updating product:', err);
      throw err;
    }
  }, [refresh]);

  // Delete a product
  const deleteProduct = useCallback(async (brandId: number, productId: number): Promise<void> => {
    try {
      const response = await fetch(`/api/nutrients?action=deleteProduct&brandId=${brandId}&productId=${productId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete product: ${response.status}`);
      }
      
      // Refresh data after deleting a product
      await refresh();
    } catch (err) {
      console.error('Error deleting product:', err);
      throw err;
    }
  }, [refresh]);

  // Restore default nutrient brands and products
  const restoreDefaults = useCallback(async (): Promise<{addedBrands: number, addedProducts: number}> => {
    try {
      setIsRestoringDefaults(true);
      
      const response = await fetch('/api/nutrients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restoreDefaults'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to restore defaults: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Refresh data after restoring defaults
      await refresh();
      
      return {
        addedBrands: data.addedBrands,
        addedProducts: data.addedProducts
      };
    } catch (err) {
      console.error('Error restoring defaults:', err);
      throw err;
    } finally {
      setIsRestoringDefaults(false);
    }
  }, [refresh]);

  // Run initial fetch when component mounts
  useEffect(() => {
    fetchNutrients();
    fetchProducts();
    
    // Set up interval refresh if needed
    if (refreshInterval > 0) {
      const intervalId = setInterval(() => {
        fetchNutrients();
        fetchProducts();
      }, refreshInterval);
      
      return () => clearInterval(intervalId);
    }
  }, [fetchNutrients, fetchProducts, refreshInterval]);

  return {
    nutrients,
    products,
    isLoading,
    isRestoringDefaults,
    error,
    refresh,
    addBrand,
    updateBrand,
    deleteBrand,
    addProduct,
    updateProduct,
    deleteProduct,
    restoreDefaults
  };
} 
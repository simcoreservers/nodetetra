import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data');
const NUTRIENTS_FILE = path.join(DATA_PATH, 'nutrients.json');

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

/**
 * Get all nutrient brands and products
 */
export function getAllNutrients(): NutrientBrand[] {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Check if the nutrients file exists, if not create with default data
    if (!fs.existsSync(NUTRIENTS_FILE)) {
      const defaultNutrients = getDefaultNutrients();
      fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(defaultNutrients, null, 2), 'utf8');
      return defaultNutrients;
    }

    const rawData = fs.readFileSync(NUTRIENTS_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Error getting nutrients:', error);
    throw error;
  }
}

/**
 * Returns a set of default nutrient brands and products for first-time setup
 */
function getDefaultNutrients(): NutrientBrand[] {
  const now = Date.now();
  
  return [
    {
      id: now,
      brand: "General Hydroponics",
      products: [
        {
          id: now + 1,
          name: "Flora Micro",
          npk: "5-0-1",
          description: "Provides nitrogen, potassium and calcium as well as micronutrients."
        },
        {
          id: now + 2,
          name: "Flora Gro",
          npk: "2-1-6",
          description: "Stimulates structural and vegetative growth."
        },
        {
          id: now + 3,
          name: "Flora Bloom",
          npk: "0-5-4",
          description: "For abundant fruit and flower development."
        }
      ]
    },
    {
      id: now + 100,
      brand: "Advanced Nutrients",
      products: [
        {
          id: now + 101,
          name: "pH Perfect Grow",
          npk: "3-0-0",
          description: "Specialized for vegetative growth."
        },
        {
          id: now + 102,
          name: "pH Perfect Bloom",
          npk: "0-4-4",
          description: "Specialized for bloom phase."
        },
        {
          id: now + 103,
          name: "pH Perfect Micro",
          npk: "5-0-0",
          description: "Provides essential micronutrients."
        }
      ]
    }
  ];
}

/**
 * Add a new nutrient brand
 */
export function addNutrientBrand(brand: string): NutrientBrand {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Check if brand already exists
    if (nutrients.some(b => b.brand.toLowerCase() === brand.toLowerCase())) {
      throw new Error(`Brand "${brand}" already exists`);
    }

    // Create new brand
    const newBrand: NutrientBrand = {
      id: Date.now(),
      brand: brand,
      products: []
    };

    // Add to array and save
    nutrients.push(newBrand);
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
    
    return newBrand;
  } catch (error) {
    console.error('Error adding nutrient brand:', error);
    throw error;
  }
}

/**
 * Update a nutrient brand
 */
export function updateNutrientBrand(id: number, brand: string): NutrientBrand {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Find the brand to update
    const brandIndex = nutrients.findIndex(b => b.id === id);
    if (brandIndex === -1) {
      throw new Error(`Brand with ID ${id} not found`);
    }

    // Check if the new name already exists (except for this brand)
    if (nutrients.some(b => b.brand.toLowerCase() === brand.toLowerCase() && b.id !== id)) {
      throw new Error(`Brand "${brand}" already exists`);
    }

    // Update brand name
    nutrients[brandIndex].brand = brand;
    
    // Save changes
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
    
    return nutrients[brandIndex];
  } catch (error) {
    console.error('Error updating nutrient brand:', error);
    throw error;
  }
}

/**
 * Delete a nutrient brand
 */
export function deleteNutrientBrand(id: number): void {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Find the brand index
    const brandIndex = nutrients.findIndex(b => b.id === id);
    if (brandIndex === -1) {
      throw new Error(`Brand with ID ${id} not found`);
    }

    // Remove the brand
    nutrients.splice(brandIndex, 1);
    
    // Save changes
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
  } catch (error) {
    console.error('Error deleting nutrient brand:', error);
    throw error;
  }
}

/**
 * Add a new nutrient product to a brand
 */
export function addNutrientProduct(brandId: number, product: Omit<NutrientProduct, 'id'>): NutrientProduct {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Find the brand
    const brandIndex = nutrients.findIndex(b => b.id === brandId);
    if (brandIndex === -1) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }

    // Check if product name already exists in this brand
    if (nutrients[brandIndex].products.some(p => p.name.toLowerCase() === product.name.toLowerCase())) {
      throw new Error(`Product "${product.name}" already exists for this brand`);
    }

    // Create new product with ID
    const newProduct: NutrientProduct = {
      id: Date.now(),
      ...product
    };

    // Add to brand's products
    nutrients[brandIndex].products.push(newProduct);
    
    // Save changes
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
    
    return newProduct;
  } catch (error) {
    console.error('Error adding nutrient product:', error);
    throw error;
  }
}

/**
 * Update a nutrient product
 */
export function updateNutrientProduct(
  brandId: number, 
  productId: number, 
  product: Omit<NutrientProduct, 'id'>
): NutrientProduct {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Find the brand
    const brandIndex = nutrients.findIndex(b => b.id === brandId);
    if (brandIndex === -1) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }

    // Find the product
    const productIndex = nutrients[brandIndex].products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Check if the new name already exists (except for this product)
    if (nutrients[brandIndex].products.some(
      p => p.name.toLowerCase() === product.name.toLowerCase() && p.id !== productId)
    ) {
      throw new Error(`Product "${product.name}" already exists for this brand`);
    }

    // Update product
    nutrients[brandIndex].products[productIndex] = {
      id: productId,
      ...product
    };
    
    // Save changes
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
    
    return nutrients[brandIndex].products[productIndex];
  } catch (error) {
    console.error('Error updating nutrient product:', error);
    throw error;
  }
}

/**
 * Delete a nutrient product
 */
export function deleteNutrientProduct(brandId: number, productId: number): void {
  if (typeof window !== 'undefined') {
    throw new Error('This function is meant to be run on the server only');
  }

  try {
    const nutrients = getAllNutrients();
    
    // Find the brand
    const brandIndex = nutrients.findIndex(b => b.id === brandId);
    if (brandIndex === -1) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }

    // Find the product
    const productIndex = nutrients[brandIndex].products.findIndex(p => p.id === productId);
    if (productIndex === -1) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Remove the product
    nutrients[brandIndex].products.splice(productIndex, 1);
    
    // Save changes
    fs.writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
  } catch (error) {
    console.error('Error deleting nutrient product:', error);
    throw error;
  }
}

/**
 * Get a flat list of all nutrient products
 */
export function getAllProducts(): { 
  productId: number; 
  brandId: number; 
  brandName: string; 
  name: string; 
  npk: string; 
  description: string 
}[] {
  const nutrients = getAllNutrients();
  
  return nutrients.flatMap(brand => 
    brand.products.map(product => ({
      productId: product.id,
      brandId: brand.id,
      brandName: brand.brand,
      name: product.name,
      npk: product.npk,
      description: product.description
    }))
  );
} 
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
export function getDefaultNutrients(): NutrientBrand[] {
  // Use a base timestamp
  const baseTime = Date.now();
  // Use incremental IDs instead of small additions to timestamp
  let nextId = baseTime;
  
  // Helper to get next unique ID
  const getNextId = () => nextId++;
  
  return [
    {
      id: getNextId(),
      brand: "General Hydroponics",
      products: [
        {
          id: getNextId(),
          name: "Flora Micro",
          npk: "5-0-1",
          description: "Provides nitrogen, potassium and calcium as well as micronutrients."
        },
        {
          id: getNextId(),
          name: "Flora Gro",
          npk: "2-1-6",
          description: "Stimulates structural and vegetative growth."
        },
        {
          id: getNextId(),
          name: "Flora Bloom",
          npk: "0-5-4",
          description: "For abundant fruit and flower development."
        },
        {
          id: getNextId(),
          name: "FloraNova Grow",
          npk: "7-4-8",
          description: "One-part nutrient for vegetative growth phase."
        },
        {
          id: getNextId(),
          name: "FloraNova Bloom",
          npk: "4-8-7",
          description: "One-part nutrient for flowering and fruiting."
        },
        {
          id: getNextId(),
          name: "CALiMAGic",
          npk: "1-0-0",
          description: "Calcium-magnesium supplement to prevent deficiencies."
        },
        {
          id: getNextId(),
          name: "Armor Si",
          npk: "0-0-0",
          description: "Silica supplement to strengthen cell walls."
        },
        {
          id: getNextId(),
          name: "Liquid KoolBloom",
          npk: "0-10-10",
          description: "Flowering enhancer for early to mid-bloom phase."
        },
        {
          id: getNextId(),
          name: "Dry KoolBloom",
          npk: "2-45-28",
          description: "Powerful bloom booster for late flowering phase."
        },
        {
          id: getNextId(),
          name: "Flora Nectar",
          npk: "0-0-1",
          description: "Sweetening and flavoring enhancer for flowering plants."
        },
        {
          id: getNextId(),
          name: "RapidStart",
          npk: "1-0.5-1",
          description: "Root enhancer for seedlings and cuttings."
        },
        {
          id: getNextId(),
          name: "Diamond Black",
          npk: "0-0-1",
          description: "Humic acid supplement to improve nutrient uptake."
        },
        {
          id: getNextId(),
          name: "Floralicious Plus",
          npk: "1-1-1",
          description: "Organic nutrient supplement with beneficial microbes."
        },
        {
          id: getNextId(),
          name: "MaxiGro",
          npk: "10-5-14",
          description: "One-part powdered nutrient for vegetative growth."
        },
        {
          id: getNextId(),
          name: "MaxiBloom",
          npk: "5-15-14",
          description: "One-part powdered nutrient for flowering and fruiting."
        },
        {
          id: getNextId(),
          name: "Florablend",
          npk: "0.5-0.01-0.5",
          description: "Biologically active organic supplement."
        }
      ]
    },
    {
      id: getNextId(),
      brand: "Advanced Nutrients",
      products: [
        {
          id: getNextId(),
          name: "pH Perfect Grow",
          npk: "3-0-0",
          description: "Specialized for vegetative growth."
        },
        {
          id: getNextId(),
          name: "pH Perfect Bloom",
          npk: "0-4-4",
          description: "Specialized for bloom phase."
        },
        {
          id: getNextId(),
          name: "pH Perfect Micro",
          npk: "5-0-0",
          description: "Provides essential micronutrients."
        }
      ]
    },
    {
      id: getNextId(),
      brand: "Athena",
      products: [
        {
          id: getNextId(),
          name: "Athena Blended",
          npk: "4-0-1",
          description: "All-in-one professional grade nutrient solution."
        },
        {
          id: getNextId(),
          name: "Core",
          npk: "5-15-14",
          description: "Balanced base nutrient for all growth stages."
        },
        {
          id: getNextId(),
          name: "Grow A",
          npk: "5-0-3",
          description: "Part A of two-part complete nutrient system for vegetative growth."
        },
        {
          id: getNextId(),
          name: "Grow B",
          npk: "0-4-3",
          description: "Part B of two-part complete nutrient system for vegetative growth."
        }
      ]
    },
    {
      id: getNextId(),
      brand: "Fox Farm",
      products: [
        {
          id: getNextId(),
          name: "Grow Big Hydro",
          npk: "6-4-4",
          description: "For abundant vegetative growth in hydroponic systems."
        },
        {
          id: getNextId(),
          name: "Tiger Bloom",
          npk: "2-8-4",
          description: "High phosphorus fertilizer for flowering and fruiting phase."
        },
        {
          id: getNextId(),
          name: "Big Bloom",
          npk: "0.01-0.3-0.7",
          description: "Micronutrient and microbial supplement for all growth phases."
        }
      ]
    },
    {
      id: getNextId(),
      brand: "Botanicare",
      products: [
        {
          id: getNextId(),
          name: "Pure Blend Pro Grow",
          npk: "3-2-4",
          description: "Vegetative formula for hydroponic systems."
        },
        {
          id: getNextId(),
          name: "Pure Blend Pro Bloom",
          npk: "2-3-5",
          description: "Bloom formula for flowering and fruiting plants."
        },
        {
          id: getNextId(),
          name: "Cal-Mag Plus",
          npk: "2-0-0",
          description: "Calcium, magnesium and iron supplement to prevent deficiencies."
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

    // Generate a new unique ID
    // Collect all existing product IDs across all brands
    const allExistingIds = nutrients.flatMap(brand => 
      brand.products.map(product => product.id)
    );
    
    // Find a unique ID that doesn't exist in any brand
    let newId = Date.now();
    // Keep incrementing until we find an unused ID
    while (allExistingIds.includes(newId)) {
      newId++;
    }

    // Create new product with the unique ID
    const newProduct: NutrientProduct = {
      id: newId,
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
import { NextRequest, NextResponse } from 'next/server';
import { 
  getAllNutrients, 
  addNutrientBrand, 
  updateNutrientBrand, 
  deleteNutrientBrand,
  addNutrientProduct,
  updateNutrientProduct,
  deleteNutrientProduct,
  getAllProducts,
  getDefaultNutrients
} from '../../lib/nutrients';

/**
 * GET route handler for nutrients
 */
export async function GET(request: NextRequest) {
  try {
    // Check if we should return only products in flat list
    const { searchParams } = new URL(request.url);
    const productsOnly = searchParams.get('productsOnly') === 'true';
    
    if (productsOnly) {
      const products = getAllProducts();
      return NextResponse.json({
        products,
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    }
    
    // Get all nutrients and return them
    const nutrients = getAllNutrients();
    return NextResponse.json({
      nutrients,
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting nutrients:', error);
    return NextResponse.json({
      error: `Failed to get nutrients: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST route handler for brands and products
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action, brandName, brandId, productName, npk, description } = data;
    
    if (!action) {
      return NextResponse.json({ 
        error: 'Missing "action" parameter', 
        status: 'error', 
        timestamp: new Date().toISOString() 
      }, { status: 400 });
    }
    
    switch (action) {
      case 'addBrand':
        if (!brandName) {
          return NextResponse.json({ 
            error: 'Missing "brandName" parameter', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        const newBrand = addNutrientBrand(brandName);
        return NextResponse.json({
          brand: newBrand,
          status: 'ok',
          message: `Brand "${brandName}" added successfully`,
          timestamp: new Date().toISOString()
        });
        
      case 'addProduct':
        if (!brandId || !productName || !npk) {
          return NextResponse.json({ 
            error: 'Missing required parameters (brandId, productName, npk)', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        const newProduct = addNutrientProduct(brandId, {
          name: productName,
          npk,
          description: description || ''
        });
        
        return NextResponse.json({
          product: newProduct,
          status: 'ok',
          message: `Product "${productName}" added successfully`,
          timestamp: new Date().toISOString()
        });
      
      case 'restoreDefaults':
        // Get current nutrients
        const currentNutrients = getAllNutrients();
        // Get default nutrients
        const defaultNutrients = getDefaultNutrients();
        
        // Track how many items we added
        let addedBrands = 0;
        let addedProducts = 0;
        
        // Process each default brand
        for (const defaultBrand of defaultNutrients) {
          // Check if brand exists (case insensitive)
          const existingBrand = currentNutrients.find(b => 
            b.brand.toLowerCase() === defaultBrand.brand.toLowerCase()
          );
          
          let brandId: number;
          
          if (!existingBrand) {
            // Add the brand if it doesn't exist
            const newBrand = addNutrientBrand(defaultBrand.brand);
            brandId = newBrand.id;
            addedBrands++;
          } else {
            brandId = existingBrand.id;
          }
          
          // Process each product for this brand
          for (const defaultProduct of defaultBrand.products) {
            // If brand already existed, check if this product exists
            if (existingBrand) {
              const productExists = existingBrand.products.some(p => 
                p.name.toLowerCase() === defaultProduct.name.toLowerCase()
              );
              
              if (productExists) {
                // Skip existing products
                continue;
              }
            }
            
            // Add the product
            try {
              addNutrientProduct(brandId, {
                name: defaultProduct.name,
                npk: defaultProduct.npk,
                description: defaultProduct.description
              });
              addedProducts++;
            } catch (error) {
              console.error(`Error adding product ${defaultProduct.name}:`, error);
              // Continue with other products even if one fails
            }
          }
        }
        
        return NextResponse.json({
          status: 'ok',
          message: `Restored defaults: Added ${addedBrands} brands and ${addedProducts} products`,
          addedBrands,
          addedProducts,
          timestamp: new Date().toISOString()
        });
      
      default:
        return NextResponse.json({ 
          error: `Invalid action: ${action}`, 
          status: 'error', 
          timestamp: new Date().toISOString() 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in nutrients POST:', error);
    return NextResponse.json({
      error: `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * PUT route handler for updating brands and products
 */
export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const { action, brandId, brandName, productId, productName, npk, description } = data;
    
    if (!action) {
      return NextResponse.json({ 
        error: 'Missing "action" parameter', 
        status: 'error', 
        timestamp: new Date().toISOString() 
      }, { status: 400 });
    }
    
    switch (action) {
      case 'updateBrand':
        if (!brandId || !brandName) {
          return NextResponse.json({ 
            error: 'Missing required parameters (brandId, brandName)', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        const updatedBrand = updateNutrientBrand(brandId, brandName);
        return NextResponse.json({
          brand: updatedBrand,
          status: 'ok',
          message: `Brand updated successfully`,
          timestamp: new Date().toISOString()
        });
        
      case 'updateProduct':
        if (!brandId || !productId || !productName || !npk) {
          return NextResponse.json({ 
            error: 'Missing required parameters (brandId, productId, productName, npk)', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        const updatedProduct = updateNutrientProduct(brandId, productId, {
          name: productName,
          npk,
          description: description || ''
        });
        
        return NextResponse.json({
          product: updatedProduct,
          status: 'ok',
          message: `Product updated successfully`,
          timestamp: new Date().toISOString()
        });
      
      default:
        return NextResponse.json({ 
          error: `Invalid action: ${action}`, 
          status: 'error', 
          timestamp: new Date().toISOString() 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in nutrients PUT:', error);
    return NextResponse.json({
      error: `Update failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * DELETE route handler for brands and products
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const brandId = searchParams.get('brandId');
    const productId = searchParams.get('productId');
    
    if (!action) {
      return NextResponse.json({ 
        error: 'Missing "action" parameter', 
        status: 'error', 
        timestamp: new Date().toISOString() 
      }, { status: 400 });
    }
    
    switch (action) {
      case 'deleteBrand':
        if (!brandId) {
          return NextResponse.json({ 
            error: 'Missing required parameter: brandId', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        deleteNutrientBrand(parseInt(brandId));
        return NextResponse.json({
          status: 'ok',
          message: `Brand deleted successfully`,
          timestamp: new Date().toISOString()
        });
        
      case 'deleteProduct':
        if (!brandId || !productId) {
          return NextResponse.json({ 
            error: 'Missing required parameters (brandId, productId)', 
            status: 'error', 
            timestamp: new Date().toISOString() 
          }, { status: 400 });
        }
        
        deleteNutrientProduct(parseInt(brandId), parseInt(productId));
        return NextResponse.json({
          status: 'ok',
          message: `Product deleted successfully`,
          timestamp: new Date().toISOString()
        });
      
      default:
        return NextResponse.json({ 
          error: `Invalid action: ${action}`, 
          status: 'error', 
          timestamp: new Date().toISOString() 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in nutrients DELETE:', error);
    return NextResponse.json({
      error: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
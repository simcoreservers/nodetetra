import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { initializeServer } from '@/app/lib/server-init';
import { getAllNutrients, NutrientBrand, NutrientProduct } from '@/app/lib/nutrients';
import { getProfiles } from '@/app/api/profiles/route'; // Import the profiles function

// Path to data files
const DATA_PATH = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');
const AUTODOSING_FILE = path.join(DATA_PATH, 'autodosing.json');
const NUTRIENTS_FILE = path.join(DATA_PATH, 'nutrients.json');

/**
 * Fix duplicate product IDs in the nutrients data
 */
async function fixDuplicateProductIds() {
  // Check if nutrients file exists
  if (!existsSync(NUTRIENTS_FILE)) {
    return { fixed: 0 };
  }

  try {
    // Read current nutrients data
    const rawData = readFileSync(NUTRIENTS_FILE, 'utf8');
    const nutrients: NutrientBrand[] = JSON.parse(rawData);
    
    // Track all product IDs we've seen
    const seenIds = new Set<number>();
    // Count how many IDs we've fixed
    let fixedCount = 0;
    // Starting timestamp for new IDs
    let nextId = Date.now();
    
    // Process each brand and its products
    for (const brand of nutrients) {
      for (const product of brand.products) {
        // Check if this ID has been seen before
        if (seenIds.has(product.id)) {
          // Assign a new unique ID
          const oldId = product.id;
          // Find a new ID that hasn't been used
          while (seenIds.has(nextId)) {
            nextId++;
          }
          product.id = nextId;
          seenIds.add(nextId);
          fixedCount++;
          console.log(`Fixed duplicate product ID: ${oldId} → ${nextId}`);
          nextId++;
        } else {
          // Add this ID to our seen set
          seenIds.add(product.id);
        }
      }
    }
    
    // If we fixed any duplicates, save the file
    if (fixedCount > 0) {
      writeFileSync(NUTRIENTS_FILE, JSON.stringify(nutrients, null, 2), 'utf8');
      console.log(`Fixed ${fixedCount} duplicate product IDs`);
    }
    
    return { fixed: fixedCount };
  } catch (error) {
    console.error('Error fixing duplicate product IDs:', error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Ensure all required data files exist with default values
 */
async function ensureDataFiles() {
  try {
    // Ensure data directory exists
    if (!existsSync(DATA_PATH)) {
      await fs.mkdir(DATA_PATH, { recursive: true });
      console.log('Created data directory');
    }
    
    // Initialize profiles with the updated function
    // This will create the file with default profiles if it doesn't exist
    await getProfiles();
    console.log('Initialized plant profiles');
    
    // Initialize nutrients with the updated function
    // This will create the file with default nutrient brands if it doesn't exist
    getAllNutrients();
    console.log('Initialized nutrient database');
    
    // Fix any duplicate product IDs
    const fixResult = await fixDuplicateProductIds();
    if (fixResult.fixed && fixResult.fixed > 0) {
      console.log(`Fixed ${fixResult.fixed} duplicate product IDs in nutrients database`);
    }
    
    // Create active profile reference if needed
    if (!existsSync(ACTIVE_PROFILE_FILE)) {
      await fs.writeFile(
        ACTIVE_PROFILE_FILE,
        JSON.stringify({ activeName: "Lettuce" }, null, 2),
        'utf8'
      );
      console.log('Created active profile reference');
    }
    
    // Create default dosing config if needed
    if (!existsSync(DOSING_FILE)) {
      const defaultDosing = {
        settings: {
          targetPh: {
            min: 5.8,
            max: 6.2,
            current: 6.0
          },
          targetEc: {
            min: 1.2,
            max: 1.5,
            current: 1.35
          },
          dosingLimits: {
            "pH Up": 50,
            "pH Down": 50,
            "Nutrient A": 100,
            "Nutrient B": 100
            // Additional pumps can be added dynamically as needed
          },
          timestamp: new Date().toISOString()
        },
        history: []
      };
      
      await fs.writeFile(
        DOSING_FILE,
        JSON.stringify(defaultDosing, null, 2),
        'utf8'
      );
      console.log('Created default dosing configuration');
    }
    
    return { success: true, fixedProductIds: fixResult.fixed };
  } catch (error) {
    console.error('Error ensuring data files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check for "fix" in query params for direct fixing
    const url = new URL(request.url);
    const shouldFixIds = url.searchParams.get('fix') === 'true';
    
    if (shouldFixIds) {
      const fixResult = await fixDuplicateProductIds();
      return NextResponse.json({
        status: 'ok',
        message: 'Fixed duplicate product IDs',
        fixedCount: fixResult.fixed || 0,
        error: fixResult.error
      });
    }
    
    // Ensure all required data files exist
    const fileResult = await ensureDataFiles();
    if (!fileResult.success) {
      console.error('Error ensuring data files:', fileResult.error);
    }
    
    // Initialize server subsystems
    await initializeServer();
    
    return NextResponse.json({
      status: 'ok',
      message: 'System initialized',
      fileSetup: fileResult
    });
  } catch (error) {
    console.error('Error initializing system:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
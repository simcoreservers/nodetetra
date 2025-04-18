import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { ProfileSettings } from '@/app/hooks/useProfileData';

// Path to the profiles JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');

// Helper to ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_PATH);
  } catch (error) {
    await fs.mkdir(DATA_PATH, { recursive: true });
  }
}

// Helper to read profiles from file
async function getProfiles(): Promise<ProfileSettings[]> {
  try {
    await ensureDataDir();
    const fileData = await fs.readFile(PROFILES_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (error) {
    // If file doesn't exist or has invalid JSON, return empty array
    return [];
  }
}

// Helper to write profiles to file
async function saveProfiles(profiles: ProfileSettings[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

// Helper to get active profile
async function getActiveProfile(): Promise<ProfileSettings | null> {
  try {
    await ensureDataDir();
    
    try {
      // Check if file exists
      if (!existsSync(ACTIVE_PROFILE_FILE)) {
        console.log("Active profile file doesn't exist, creating it with default values");
        
        // Get profiles
        const profiles = await getProfiles();
        const defaultProfileName = profiles.length > 0 ? profiles[0].name : "Default";
        
        // Create default active profile file
        await fs.writeFile(
          ACTIVE_PROFILE_FILE, 
          JSON.stringify({ activeName: defaultProfileName }, null, 2),
          'utf8'
        );
        
        // Return the active profile
        return profiles.length > 0 ? profiles[0] : null;
      }
      
      // Read the existing file
      const fileData = await fs.readFile(ACTIVE_PROFILE_FILE, 'utf8');
      const activeProfileName = JSON.parse(fileData).activeName;
      
      // Find the profile with this name
      const profiles = await getProfiles();
      return profiles.find(p => p.name === activeProfileName) || (profiles.length > 0 ? profiles[0] : null);
    } catch (error) {
      console.log(`Error reading active profile file: ${error instanceof Error ? error.message : String(error)}`);
      // If file doesn't exist or has invalid JSON, return the first profile
      const profiles = await getProfiles();
      return profiles.length > 0 ? profiles[0] : null;
    }
  } catch (error) {
    console.error(`Error accessing data directory: ${error instanceof Error ? error.message : String(error)}`);
    // Return null to indicate failure
    return null;
  }
}

// Helper to set active profile
async function setActiveProfile(profileName: string): Promise<ProfileSettings | null> {
  await ensureDataDir();
  
  // Find the profile with this name
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.name === profileName);
  
  if (!profile) {
    return null;
  }
  
  // Save active profile name to file
  await fs.writeFile(ACTIVE_PROFILE_FILE, JSON.stringify({ activeName: profileName }, null, 2), 'utf8');
  return profile;
}

// GET handler - retrieve active profile
export async function GET(request: NextRequest) {
  try {
    const activeProfile = await getActiveProfile();
    
    if (!activeProfile) {
      console.log('No active profile found or error accessing profile data');
      // Return a default profile as fallback
      return NextResponse.json({
        name: "Default Profile",
        plantType: "Generic",
        targetPh: { min: 5.8, max: 6.2 },
        targetEc: { min: 1.2, max: 1.6 },
        notes: "Default profile used when no active profile is available",
        createdAt: new Date().toISOString()
      });
    }
    
    return NextResponse.json(activeProfile);
  } catch (error) {
    console.error('Error fetching active profile:', error);
    // Return a generic default profile on error
    return NextResponse.json({
      name: "Default Profile",
      plantType: "Generic",
      targetPh: { min: 5.8, max: 6.2 },
      targetEc: { min: 1.2, max: 1.6 },
      notes: "Default profile used when error occurred",
      createdAt: new Date().toISOString()
    });
  }
}

// POST handler - set active profile
export async function POST(request: NextRequest) {
  try {
    const { profileName } = await request.json();
    
    if (!profileName) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }
    
    const activeProfile = await setActiveProfile(profileName);
    
    if (!activeProfile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(activeProfile);
  } catch (error) {
    console.error('Error setting active profile:', error);
    return NextResponse.json(
      { error: 'Failed to set active profile' },
      { status: 500 }
    );
  }
} 
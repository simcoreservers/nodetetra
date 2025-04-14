import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { ProfileSettings } from '@/app/hooks/useProfileData';

// Path to the profiles JSON file
const DATA_PATH = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');

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
    
    // Check if profiles file exists
    if (!existsSync(PROFILES_FILE)) {
      console.log("Profiles file doesn't exist, creating it with default profile");
      
      // Create a default profile
      const defaultProfile: ProfileSettings = {
        name: "Default",
        cropType: "General Hydroponic",
        targetPh: { min: 5.8, max: 6.2 },
        targetEc: { min: 1.2, max: 1.6 },
        notes: "Default profile with general settings for most plants",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Save the default profile
      await saveProfiles([defaultProfile]);
      console.log("Created default profile");
      
      return [defaultProfile];
    }
    
    try {
      const fileData = await fs.readFile(PROFILES_FILE, 'utf8');
      return JSON.parse(fileData);
    } catch (parseError) {
      console.error("Error parsing profiles file:", parseError);
      return [];
    }
  } catch (error) {
    console.error(`Error in getProfiles: ${error instanceof Error ? error.message : String(error)}`);
    // If file doesn't exist or has invalid JSON, return empty array
    return [];
  }
}

// Helper to write profiles to file
async function saveProfiles(profiles: ProfileSettings[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

// GET handler - retrieve all profiles
export async function GET(request: NextRequest) {
  try {
    const profiles = await getProfiles();
    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

// POST handler - create a new profile
export async function POST(request: NextRequest) {
  try {
    const profiles = await getProfiles();
    const newProfile = await request.json();
    
    console.log("API received create profile request:", JSON.stringify(newProfile));
    
    // Validate required fields
    if (!newProfile.name) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }
    
    // Ensure crop type exists and is trimmed
    if (!newProfile.cropType || newProfile.cropType.trim() === '') {
      return NextResponse.json(
        { error: 'Crop type is required' },
        { status: 400 }
      );
    }
    
    // Trim the crop type to ensure consistency
    newProfile.cropType = newProfile.cropType.trim();
    
    // Check if profile with same name already exists
    if (profiles.some(p => p.name === newProfile.name)) {
      return NextResponse.json(
        { error: 'A profile with this name already exists' },
        { status: 409 }
      );
    }
    
    // Add timestamps
    const now = new Date().toISOString();
    const profileWithTimestamps: ProfileSettings = {
      ...newProfile,
      createdAt: now,
      updatedAt: now
    };
    
    // Add new profile and save
    profiles.push(profileWithTimestamps);
    await saveProfiles(profiles);
    
    console.log("Profile created successfully:", profileWithTimestamps.name);
    return NextResponse.json(profileWithTimestamps, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error creating profile:', errorMessage);
    return NextResponse.json(
      { error: `Failed to create profile: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// PUT handler - update an existing profile
export async function PUT(request: NextRequest) {
  try {
    const profiles = await getProfiles();
    const updatedProfile = await request.json();
    
    // Validate required fields
    if (!updatedProfile.name) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }
    
    // Find the profile to update
    const profileIndex = profiles.findIndex(p => p.name === updatedProfile.name);
    
    if (profileIndex === -1) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    // Update timestamp
    const profileWithTimestamp = {
      ...profiles[profileIndex],
      ...updatedProfile,
      updatedAt: new Date().toISOString()
    };
    
    // Update profile and save
    profiles[profileIndex] = profileWithTimestamp;
    await saveProfiles(profiles);
    
    return NextResponse.json(profileWithTimestamp);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

// DELETE handler - delete a profile
export async function DELETE(request: NextRequest) {
  try {
    // Extract profile name from the URL path
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const profileName = pathSegments[pathSegments.length - 1];
    
    if (!profileName || profileName === 'profiles') {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }
    
    // Decode the URL-encoded profile name
    const decodedProfileName = decodeURIComponent(profileName);
    
    const profiles = await getProfiles();
    const initialLength = profiles.length;
    
    // Filter out the profile to delete
    const updatedProfiles = profiles.filter(p => p.name !== decodedProfileName);
    
    if (updatedProfiles.length === initialLength) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    // Save updated profiles
    await saveProfiles(updatedProfiles);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
} 
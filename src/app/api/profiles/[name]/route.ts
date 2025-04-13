import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
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

// GET handler - retrieve a specific profile by name
export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const profileName = decodeURIComponent(params.name);
    const profiles = await getProfiles();
    
    const profile = profiles.find(p => p.name === profileName);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// PUT handler - update an existing profile
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const profileName = decodeURIComponent(params.name);
    console.log(`API received update profile request for "${profileName}"`);
    
    const profiles = await getProfiles();
    const updatedProfile = await request.json();
    
    console.log(`Update profile data:`, JSON.stringify(updatedProfile));
    
    // If crop type is provided, ensure it's trimmed
    if (updatedProfile.cropType) {
      updatedProfile.cropType = updatedProfile.cropType.trim();
      
      // Validate crop type
      if (updatedProfile.cropType === '') {
        return NextResponse.json(
          { error: 'Crop type cannot be empty' },
          { status: 400 }
        );
      }
    }
    
    // Find the profile to update
    const profileIndex = profiles.findIndex(p => p.name === profileName);
    
    if (profileIndex === -1) {
      console.error(`Profile not found for update: "${profileName}"`);
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
    
    console.log(`Profile "${profileName}" updated successfully`);
    return NextResponse.json(profileWithTimestamp);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error updating profile:', errorMessage);
    return NextResponse.json(
      { error: `Failed to update profile: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// DELETE handler - delete a profile
export async function DELETE(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const profileName = decodeURIComponent(params.name);
    const profiles = await getProfiles();
    const initialLength = profiles.length;
    
    // Filter out the profile to delete
    const updatedProfiles = profiles.filter(p => p.name !== profileName);
    
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
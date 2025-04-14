"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useProfileData, ProfileSettings } from "../hooks/useProfileData";
import { usePumpData } from "../hooks/usePumpData";
import { API_CONFIG } from "../lib/config";

// Define interfaces for type safety
interface PumpSetting {
  name: string;
  dosage: number;
}

interface PumpAssignment {
  pumpName: string;
  dosage: number;
  nutrientId?: number;
  brandId?: number;
  productName?: string;
  brandName?: string;
  isAutoDosage?: boolean; // Flag to track if dosage is auto-calculated
}

interface PhEcRange {
  min: number;
  max: number;
}

interface WeekSchedule {
  week: number;
  ph: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  ec: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  pumpSettings: PumpSetting[];
  pumpDosages: PumpAssignment[]; // Explicit dosages for each pump per week
  growthPhase: string; // Growth phase for this specific week
}

interface Profile {
  id: number;
  name: string;
  active: boolean;
  ph: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  ec: {
    target: number;
    buffer: number;
    min?: number;
    max?: number;
  };
  pumpSettings: PumpSetting[];
  schedule: WeekSchedule[];
  currentWeek: number | null;
  cropType: string;
  growthPhase?: string;
  pumpAssignments: PumpAssignment[];
}

interface Pump {
  id: number;
  name: string;
}

interface RecommendedNutrient {
  name: string;
  dosage: number;
  type: string;
}

// Define available pumps
const availablePumps = [
  { id: 1, name: "Nutrient A" },
  { id: 2, name: "Nutrient B" },
  { id: 3, name: "pH Up" },
  { id: 4, name: "pH Down" },
  { id: 5, name: "Cal-Mag" }
] as Pump[];

// Calculate recommended dosage based on nutrient type and growth phase
const calculateRecommendedDosage = (nutrient: any, growthPhase: string, cropType: string): number => {
  if (!nutrient) return 0;
  
  // If growthPhase is Flush, return 0 for all nutrients
  if (growthPhase === 'Flush') return 0;
  
  // Default base dosages by nutrient types (ml per liter)
  const baseDosages: Record<string, number> = {
    // NPK base nutrients
    'NPK': 2.0,
    'Bloom': 2.5,
    'Grow': 2.0,
    'Micro': 1.5,
    // Supplements
    'Cal-Mag': 1.0,
    'Silica': 0.5,
    'Enzyme': 0.7,
    'Root Stimulator': 1.2,
    'Bloom Booster': 1.5,
    // pH adjusters
    'pH Up': 0.1,
    'pH Down': 0.1,
  };
  
  // Growth phase multipliers
  const phaseMultipliers: Record<string, number> = {
    'Seedling': 0.25,
    'Vegetative': 1.0,
    'Early Flower': 1.2,
    'Mid Flower': 1.5,
    'Late Flower': 1.0,
    'Ripening': 0.5,
  };
  
  // Crop type multipliers
  const cropMultipliers: Record<string, number> = {
    'Leafy Greens': 0.8,
    'Fruiting Plants': 1.2,
    'Herbs': 0.7,
    'Root Vegetables': 1.0,
    'Berries': 1.1,
    'Cannabis': 1.3,
    // Default for other crop types
    'Custom': 1.0,
  };
  
  // Detect nutrient type from product name
  let nutrientType = 'NPK'; // Default
  const productName = nutrient.productName?.toLowerCase() || '';
  
  if (productName.includes('bloom') || productName.includes('flower')) {
    nutrientType = 'Bloom';
  } else if (productName.includes('grow') || productName.includes('veg')) {
    nutrientType = 'Grow';
  } else if (productName.includes('micro')) {
    nutrientType = 'Micro';
  } else if (productName.includes('cal-mag') || productName.includes('calcium')) {
    nutrientType = 'Cal-Mag';
  } else if (productName.includes('silica') || productName.includes('silicon')) {
    nutrientType = 'Silica';
  } else if (productName.includes('enzyme')) {
    nutrientType = 'Enzyme';
  } else if (productName.includes('root')) {
    nutrientType = 'Root Stimulator';
  } else if (productName.includes('boost')) {
    nutrientType = 'Bloom Booster';
  } else if (productName.includes('ph up') || nutrient.pumpName === 'pH Up') {
    nutrientType = 'pH Up';
  } else if (productName.includes('ph down') || nutrient.pumpName === 'pH Down') {
    nutrientType = 'pH Down';
  }
  
  // Get the base dosage for this nutrient type
  const baseDosage = baseDosages[nutrientType] || 1.0;
  
  // Get multipliers
  const phaseMultiplier = phaseMultipliers[growthPhase] || 1.0;
  const cropMultiplier = cropMultipliers[cropType] || cropMultipliers['Custom'];
  
  // Calculate recommended dosage
  const recommendedDosage = baseDosage * phaseMultiplier * cropMultiplier;
  
  // Round to one decimal place
  return Math.round(recommendedDosage * 10) / 10;
};

const generateGrowthSchedule = (cropType: string, duration = 8) => {
  const schedules: Record<string, Array<{phase: string; weeks: number; ph: {target: number; buffer: number}; ec: {target: number; buffer: number}}>> = {
    "Leafy Greens": [
      { phase: "Seedling", weeks: 1, ph: { target: 6.0, buffer: 0.2 }, ec: { target: 0.8, buffer: 0.2 } },
      { phase: "Vegetative", weeks: 3, ph: { target: 6.0, buffer: 0.2 }, ec: { target: 1.2, buffer: 0.2 } },
    ],
    "Fruiting Plants": [
      { phase: "Seedling", weeks: 1, ph: { target: 6.0, buffer: 0.2 }, ec: { target: 0.8, buffer: 0.2 } },
      { phase: "Vegetative", weeks: 2, ph: { target: 5.8, buffer: 0.2 }, ec: { target: 1.5, buffer: 0.3 } },
      { phase: "Early Flower", weeks: 2, ph: { target: 5.8, buffer: 0.2 }, ec: { target: 2.0, buffer: 0.3 } },
      { phase: "Mid Flower", weeks: 2, ph: { target: 5.8, buffer: 0.2 }, ec: { target: 2.5, buffer: 0.4 } },
      { phase: "Late Flower", weeks: 1, ph: { target: 5.8, buffer: 0.2 }, ec: { target: 2.0, buffer: 0.3 } },
    ]
  };
  
  const template = schedules[cropType] || schedules["Leafy Greens"];
  const newSchedule: WeekSchedule[] = [];
  
  let weekNumber = 1;
  
  // First pass: add all defined phases from the template
  template.forEach(phase => {
    for (let i = 0; i < phase.weeks; i++) {
      if (weekNumber > duration) break;
      
      newSchedule.push({
        week: weekNumber,
        growthPhase: phase.phase,
        ph: {
          target: phase.ph.target,
          buffer: phase.ph.buffer,
          min: Math.round((phase.ph.target - phase.ph.buffer) * 100) / 100,
          max: Math.round((phase.ph.target + phase.ph.buffer) * 100) / 100,
        },
        ec: {
          target: phase.ec.target,
          buffer: phase.ec.buffer,
          min: Math.round((phase.ec.target - phase.ec.buffer) * 100) / 100,
          max: Math.round((phase.ec.target + phase.ec.buffer) * 100) / 100,
        },
        pumpSettings: [],
        pumpDosages: []
      });
      weekNumber++;
    }
  });
  
  // Second pass: extend the schedule by repeating the last phase if needed
  if (weekNumber <= duration && template.length > 0) {
    const lastPhase = template[template.length - 1];
    
    while (weekNumber <= duration) {
      newSchedule.push({
        week: weekNumber,
        growthPhase: lastPhase.phase,
        ph: {
          target: lastPhase.ph.target,
          buffer: lastPhase.ph.buffer,
          min: Math.round((lastPhase.ph.target - lastPhase.ph.buffer) * 100) / 100,
          max: Math.round((lastPhase.ph.target + lastPhase.ph.buffer) * 100) / 100,
        },
        ec: {
          target: lastPhase.ec.target,
          buffer: lastPhase.ec.buffer,
          min: Math.round((lastPhase.ec.target - lastPhase.ec.buffer) * 100) / 100,
          max: Math.round((lastPhase.ec.target + lastPhase.ec.buffer) * 100) / 100,
        },
        pumpSettings: [],
        pumpDosages: []
      });
      weekNumber++;
    }
  }
  
  return newSchedule;
};

export default function ProfilesPage() {
  const [activeSection, setActiveSection] = useState("profiles");
  const [activeTab, setActiveTab] = useState("list");
  const [editing, setEditing] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [showNewWeekModal, setShowNewWeekModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [sortOption, setSortOption] = useState<'name' | 'newest' | 'oldest'>('name');
  const [searchTerm, setSearchTerm] = useState("");
  const [growthPhase, setGrowthPhase] = useState("Vegetative");
  const [editingWeekIndex, setEditingWeekIndex] = useState<number | null>(null);
  const { collapsed } = useSidebar();
  
  // Get real profile data from API
  const { profiles, isLoading, error, refresh, createProfile, updateProfile, deleteProfile, activateProfile, activeProfile } = useProfileData({ 
    refreshInterval: activeTab === "edit" || API_CONFIG.DISABLE_POLLING_IN_DEV ? 0 : API_CONFIG.PROFILE_REFRESH_INTERVAL
  });
  
  // Use the pump data hook to get real-time pump data
  const { 
    data: pumpData, 
    isLoading: pumpsLoading
  } = usePumpData(activeTab === "edit" || API_CONFIG.DISABLE_POLLING_IN_DEV ? 0 : API_CONFIG.PUMP_REFRESH_INTERVAL);
  
  // Get available pumps with nutrients
  const pumpsWithNutrients = useMemo(() => {
    if (!pumpData || !pumpData.pumpStatus) return [];
    
    return pumpData.pumpStatus
      .filter(pump => pump.nutrient !== null && pump.nutrient !== undefined)
      .map(pump => ({
        name: pump.name,
        nutrient: pump.nutrient
      }));
  }, [pumpData]);
  
  // Convert ProfileSettings to Profile format using useMemo to prevent recalculation on every render
  const convertedProfiles = useMemo(() => 
    profiles.map((profile, index) => {
      // Calculate target and buffer from min/max if they don't exist
      if (!profile.targetPh.target) {
        const phMin = profile.targetPh.min !== undefined ? profile.targetPh.min : 0;
        const phMax = profile.targetPh.max !== undefined ? profile.targetPh.max : 0;
        const phTarget = ((phMax + phMin) / 2);
        const phBuffer = ((phMax - phMin) / 2);
        
        profile.targetPh = {
          ...profile.targetPh,
          target: Math.round(phTarget * 100) / 100,
          buffer: Math.round(phBuffer * 100) / 100,
        };
      }

      if (!profile.targetEc.target) {
        const ecMin = profile.targetEc.min !== undefined ? profile.targetEc.min : 0;
        const ecMax = profile.targetEc.max !== undefined ? profile.targetEc.max : 0;
        const ecTarget = ((ecMax + ecMin) / 2);
        const ecBuffer = ((ecMax - ecMin) / 2);
        
        profile.targetEc = {
          ...profile.targetEc,
          target: Math.round(ecTarget * 100) / 100,
          buffer: Math.round(ecBuffer * 100) / 100,
        };
      }
      
      return {
        ...profile,
        id: index, // Use index as ID for internal tracking
        active: activeProfile ? profile.name === activeProfile.name : false, // Mark as active if it matches the active profile
        ph: { 
          target: profile.targetPh.target || 0,
          buffer: profile.targetPh.buffer || 0,
          min: profile.targetPh.min || 0,
          max: profile.targetPh.max || 0
        },
        ec: { 
          target: profile.targetEc.target || 0,
          buffer: profile.targetEc.buffer || 0,
          min: profile.targetEc.min || 0,
          max: profile.targetEc.max || 0
        },
        pumpSettings: [], // We don't have this in the API yet
        schedule: profile.growthSchedule || [],
        currentWeek: 1, // Default to week 1
        cropType: profile.cropType,
        growthPhase: profile.growthPhase || 'Vegetative', // Use stored phase or default to Vegetative
        pumpAssignments: profile.pumpAssignments || []
      };
    }), 
    [profiles, activeProfile]
  );

  // Filter profiles based on search term
  const filteredProfiles = useMemo(() => 
    searchTerm 
      ? convertedProfiles.filter(profile => 
          profile.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          profile.cropType.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : convertedProfiles,
    [convertedProfiles, searchTerm]
  );

  // Group profiles by cropType and sort them according to the selected option
  const groupedProfiles = useMemo(() => {
    const grouped = filteredProfiles.reduce<Record<string, Profile[]>>(
      (acc, profile) => {
        const category = profile.cropType;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(profile);
        return acc;
      },
      {}
    );

    // Sort profiles within each category
    Object.keys(grouped).forEach(category => {
      switch (sortOption) {
        case 'name':
          grouped[category].sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'newest':
          // Assuming id is somewhat related to creation time for this example
          grouped[category].sort((a, b) => b.id - a.id);
          break;
        case 'oldest':
          grouped[category].sort((a, b) => a.id - b.id);
          break;
      }
    });

    return grouped;
  }, [filteredProfiles, sortOption]);

  // Get unique categories for dropdown
  const categories = useMemo(() => 
    Object.keys(groupedProfiles).sort(),
    [groupedProfiles]
  );

  // Initialize expanded state for categories when data changes
  useEffect(() => {
    if (profiles.length === 0 || activeTab === "edit") return;
    
    // Find the active profile's category
    const activeProfileObj = profiles.find(profile => activeProfile && profile.name === activeProfile.name);
    const activeCategoryName = activeProfileObj?.cropType;
    
    // Get all unique categories
    const uniqueCategories = Array.from(
      new Set(profiles.map(profile => profile.cropType))
    );
    
    // Default all categories to collapsed, except the one with the active profile
    const newExpandedState = uniqueCategories.reduce<Record<string, boolean>>(
      (acc, category) => {
        acc[category] = category === activeCategoryName;
        return acc;
      },
      {}
    );
    
    setExpandedCategories(newExpandedState);
  }, [profiles, activeTab, activeProfile]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleActivateProfile = async (profileId: number) => {
    const profileToActivate = convertedProfiles.find(p => p.id === profileId);
    if (!profileToActivate) return;
    
    // Call the activateProfile function from useProfileData hook
    await activateProfile(profileToActivate.name);
    
    // Refresh the profiles list to update the UI
    refresh();
  };

  const handleEditProfile = (profile: Profile) => {
    // First switch to edit mode to disable refreshes
    setActiveTab("edit");
    
    // Then setup the profile
    setCurrentProfile(profile);
    setEditing(true);
    
    // Set growth phase from profile if available
    if (profile.growthPhase) {
      setGrowthPhase(profile.growthPhase);
    }
  };

  const handleDeleteProfile = async (profileName: string) => {
    if (confirm(`Are you sure you want to delete the profile "${profileName}"?`)) {
      await deleteProfile(profileName);
      refresh();
    }
  };

  const handleNewProfile = () => {
    // First switch to edit mode to disable refreshes
    setActiveTab("edit");
    
    setCurrentProfile({
      id: Date.now(), // Temporary ID for new profile
      name: "New Profile",
      active: false,
      ph: { 
        target: 6.0, 
        buffer: 0.2, 
        min: 5.8, 
        max: 6.2 
      },
      ec: { 
        target: 1.3, 
        buffer: 0.3, 
        min: 1.0, 
        max: 1.6 
      },
      pumpSettings: [],
      schedule: [],
      currentWeek: null,
      cropType: categories.length > 0 ? categories[0] : "Custom", // Use first category if available
      pumpAssignments: []
    });
    setEditing(true);
  };

  const handleSaveProfile = () => {
    // Clear any placeholder fields and validate
    if (!currentProfile || !currentProfile.name) {
      alert("Profile name is required");
      return;
    }
    
    // Validate that cropType is not empty
    if (!currentProfile.cropType.trim()) {
      alert("Crop type cannot be empty. Please enter a valid crop type.");
      return;
    }
    
    // Convert profile to the format expected by the API
    const profileToSave = {
      name: currentProfile.name,
      cropType: currentProfile.cropType.trim(),
      targetPh: {
        target: currentProfile.ph.target,
        buffer: currentProfile.ph.buffer,
        min: currentProfile.ph.min,
        max: currentProfile.ph.max
      },
      targetEc: {
        target: currentProfile.ec.target,
        buffer: currentProfile.ec.buffer,
        min: currentProfile.ec.min,
        max: currentProfile.ec.max
      },
      growthSchedule: currentProfile.schedule,
      growthPhase: growthPhase, // Include the current growth phase
      pumpAssignments: currentProfile.pumpAssignments,
      notes: ""
    };
    
    // Save the profile and handle the response
    const saveProfile = async () => {
      try {
        let success = false;
        
        // Debug the current profile state to console
        console.log("Saving profile:", JSON.stringify(profileToSave));
        
        // Check if this is a new profile or an existing one
        // For existing profiles, we need to find the exact match by name in the profiles list
        const existingProfileNames = profiles.map(p => p.name);
        const isExistingProfile = existingProfileNames.includes(currentProfile.name);
        
        console.log(`Profile "${currentProfile.name}" exists: ${isExistingProfile ? 'Yes' : 'No'}`);
        console.log("Available profiles:", existingProfileNames.join(", "));
        
        if (isExistingProfile) {
          console.log("Updating existing profile:", currentProfile.name);
          // Update existing profile - we need to pass name and profile data separately
          success = await updateProfile(currentProfile.name, profileToSave);
        } else {
          console.log("Creating new profile:", currentProfile.name);
          // Create new profile
          success = await createProfile(profileToSave);
        }
        
        if (success) {
          // Delay refreshing the UI slightly to allow the API to process
          setTimeout(() => {
            setActiveTab("list");
            setEditing(false);
            setCurrentProfile(null);
            refresh(); // Explicitly refresh the data
          }, 300);
        } else {
          alert("Failed to save the profile. Please try again.");
        }
      } catch (err) {
        console.error("Error saving profile:", err);
        alert(`Error saving profile: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    
    saveProfile();
  };

  // Handle editing a specific week in the growth schedule
  const handleEditWeek = (index: number) => {
    setEditingWeekIndex(index);
  };
  
  // Duplicate a profile
  const handleDuplicateProfile = async (profileId: number) => {
    const profileToDuplicate = convertedProfiles.find(p => p.id === profileId);
    if (!profileToDuplicate) return;
    
    // Create a duplicate profile with a new name
    const duplicateName = `${profileToDuplicate.name} (Copy)`;
    
    // Convert profile to the format expected by the API
    const profileToSave = {
      name: duplicateName,
      cropType: profileToDuplicate.cropType,
      targetPh: {
        target: profileToDuplicate.ph.target,
        buffer: profileToDuplicate.ph.buffer,
        min: profileToDuplicate.ph.min,
        max: profileToDuplicate.ph.max
      },
      targetEc: {
        target: profileToDuplicate.ec.target,
        buffer: profileToDuplicate.ec.buffer,
        min: profileToDuplicate.ec.min,
        max: profileToDuplicate.ec.max
      },
      growthSchedule: profileToDuplicate.schedule,
      growthPhase: profileToDuplicate.growthPhase || 'Vegetative',
      pumpAssignments: profileToDuplicate.pumpAssignments,
      notes: ""
    };
    
    // Create new profile with duplicated data
    await createProfile(profileToSave);
    
    // Refresh the profiles list to update the UI
    refresh();
  };

  // Create recommended nutrients based on crop type
  const getRecommendedNutrients = (cropType: string): RecommendedNutrient[] => {
    const recommendations: Record<string, RecommendedNutrient[]> = {
      "Leafy Greens": [
        { name: "Vegetative Grow", dosage: 1.2, type: "base" },
        { name: "Cal-Mag", dosage: 0.8, type: "supplement" },
        { name: "Silica", dosage: 0.5, type: "supplement" },
      ],
      "Fruiting Plants": [
        { name: "Bloom Boost", dosage: 1.5, type: "base" },
        { name: "Cal-Mag", dosage: 1.0, type: "supplement" },
        { name: "Fruit Enhancer", dosage: 0.7, type: "supplement" },
        { name: "PK Booster", dosage: 0.8, type: "supplement" },
      ],
      "Herbs": [
        { name: "Herb Formula", dosage: 0.9, type: "base" },
        { name: "Cal-Mag", dosage: 0.5, type: "supplement" },
        { name: "Root Booster", dosage: 0.4, type: "supplement" },
      ]
    };
    
    return recommendations[cropType] || recommendations["Leafy Greens"];
  };
  
  // Get recommended nutrients based on the current profile's crop type
  const recommendedNutrients = useMemo(() => {
    if (!currentProfile) return [];
    return getRecommendedNutrients(currentProfile.cropType);
  }, [currentProfile?.cropType]);

  // Function to add a new week
  const addNewWeek = () => {
    if (!currentProfile) return;
    
    const phTarget = parseFloat((document.getElementById('new-week-ph-target') as HTMLInputElement).value);
    const phBuffer = parseFloat((document.getElementById('new-week-ph-buffer') as HTMLInputElement).value);
    const ecTarget = parseFloat((document.getElementById('new-week-ec-target') as HTMLInputElement).value);
    const ecBuffer = parseFloat((document.getElementById('new-week-ec-buffer') as HTMLInputElement).value);
    const weekGrowthPhase = (document.getElementById('new-week-growth-phase') as HTMLSelectElement).value;
    
    // Create pump dosages based on current pump assignments but with zero values
    const weekPumpDosages = currentProfile.pumpAssignments.map(assignment => ({
      ...assignment,
      dosage: 0,
      isAutoDosage: false
    }));
    
    const newWeek: WeekSchedule = {
      week: currentProfile.schedule.length + 1,
      ph: { 
        target: phTarget, 
        buffer: phBuffer,
        min: Math.round((phTarget - phBuffer) * 100) / 100,
        max: Math.round((phTarget + phBuffer) * 100) / 100
      },
      ec: { 
        target: ecTarget, 
        buffer: ecBuffer,
        min: Math.round((ecTarget - ecBuffer) * 100) / 100,
        max: Math.round((ecTarget + ecBuffer) * 100) / 100
      },
      pumpSettings: [],
      pumpDosages: weekPumpDosages,
      growthPhase: weekGrowthPhase
    };
    
    const newSchedule = [...currentProfile.schedule, newWeek];
    setCurrentProfile({...currentProfile, schedule: newSchedule});
    setShowNewWeekModal(false);
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Plant Profiles</h1>
          <div className="flex items-center">
            {activeTab === "list" && (
              <>
                <div className="mr-4">
                  <label className="text-sm mr-2">Sort by:</label>
                  <select
                    className="bg-[#1e1e1e] border border-[#333333] rounded p-1 text-sm"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as 'name' | 'newest' | 'oldest')}
                  >
                    <option value="name">Name</option>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                  </select>
                </div>
                <button className="btn" onClick={handleNewProfile}>Create New Profile</button>
              </>
            )}
            {activeTab === "edit" && (
              <div>
                <button className="btn btn-secondary mr-2" onClick={() => {
                  setActiveTab("list");
                  setEditing(false);
                }}>Cancel</button>
                <button className="btn" onClick={handleSaveProfile}>Save Profile</button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[#333333]">
          <div className="flex">
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'list' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`} 
              onClick={() => {
                if (editing) {
                  if (confirm("Discard changes?")) {
                    setActiveTab('list');
                    setEditing(false);
                  }
                } else {
                  setActiveTab('list');
                }
              }}
            >
              Profile List
            </button>
            {editing && (
              <button 
                className={`px-4 py-2 font-medium ${activeTab === 'edit' ? 'text-[#00a3e0] border-b-2 border-[#00a3e0]' : 'text-gray-400'}`}
                onClick={() => setActiveTab('edit')}
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00a3e0]"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4 border border-red-300 rounded">
            Error loading profiles: {error.message}
          </div>
        ) : (
          <>
            {activeTab === 'list' && (
              <div className="mb-8">
                {/* Search bar */}
                <div className="mb-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search profiles by name or crop type..."
                      className="w-full p-3 pl-10 bg-[#1e1e1e] border border-[#333333] rounded-lg"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="absolute left-3 top-3 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                    </div>
                    {searchTerm && (
                      <button 
                        className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        onClick={() => setSearchTerm("")}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {Object.keys(groupedProfiles).length === 0 && (
                  <div className="text-center p-6 bg-[#1e1e1e] rounded-lg">
                    <p className="text-gray-400">No profiles match your search.</p>
                  </div>
                )}

                {Object.entries(groupedProfiles).map(([category, profiles]) => (
                  <div key={category} className="mb-6">
                    <div 
                      className="flex items-center cursor-pointer p-3 bg-[#1e1e1e] rounded-lg mb-2 hover:bg-[#2a2a2a] transition-colors"
                      onClick={() => toggleCategory(category)}
                    >
                      <div className="mr-2 text-[#00a3e0]">
                        {expandedCategories[category] ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 9l-7 7-7-7"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 5l7 7-7 7"></path>
                          </svg>
                        )}
                      </div>
                      <div className="mr-3 text-[#00a3e0]">
                        {expandedCategories[category] ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                          </svg>
                        )}
                      </div>
                      <h2 className="text-xl font-medium flex items-center">
                        <span className="mr-2">{category}</span>
                        <span className="text-sm bg-[#333333] text-gray-300 px-2 py-0.5 rounded-full">
                          {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
                        </span>
                      </h2>
                    </div>
                    
                    {expandedCategories[category] && (
                      <div className="grid grid-cols-1 gap-4 pl-8 transition-all duration-300 ease-in-out">
                        {profiles.map((profile) => (
                          <div key={profile.id} className={`card ${profile.active ? 'border-[#00a3e0] border-2 bg-[#001824] shadow-[0_0_20px_rgba(0,163,224,0.3)] relative overflow-hidden' : ''}`}>
                            {profile.active && (
                              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00a3e0]"></div>
                            )}
                            <div className="flex justify-between items-center">
                              <div className="flex items-center">
                                <h3 className={`${profile.active ? 'text-xl text-[#00a3e0]' : 'text-lg'} font-medium`}>{profile.name}</h3>
                                {profile.active && (
                                  <span className="ml-2 px-2 py-0.5 bg-[#00a3e0] text-black text-xs rounded-full">Active</span>
                                )}
                                {profile.schedule.length > 0 && profile.currentWeek !== null && (
                                  <div className="ml-3 flex items-center">
                                    <span className="text-xs bg-[#333333] px-2 py-0.5 rounded-full">
                                      Week {profile.currentWeek} of {profile.schedule.length}
                                    </span>
                                    <div className="ml-2 w-24 h-2 bg-[#333333] rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-[#00a3e0]" 
                                        style={{ width: `${(profile.currentWeek / profile.schedule.length) * 100}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div>
                                <button className="btn btn-secondary text-sm mr-2" onClick={() => handleEditProfile(profile)}>Edit</button>
                                {!profile.active && (
                                  <button className="btn text-sm mr-2" onClick={() => handleActivateProfile(profile.id)}>Activate</button>
                                )}
                                <button 
                                  className="btn btn-secondary text-sm bg-red-600 hover:bg-red-700" 
                                  onClick={() => handleDeleteProfile(profile.name)}
                                >
                                  Delete
                                </button>
                                <button 
                                  className="btn btn-secondary text-sm mr-2" 
                                  onClick={() => handleDuplicateProfile(profile.id)}
                                >
                                  Duplicate
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-3">
                              <div>
                                <span className="text-sm block text-gray-400">pH Setting</span>
                                <div className="flex items-center">
                                  <span>{profile.ph.target.toFixed(2)}</span>
                                  <span className="text-xs text-gray-400 ml-1">±{profile.ph.buffer.toFixed(2)}</span>
                                </div>
                                <span className="text-xs text-gray-400">Range: {profile.ph.min?.toFixed(2)} - {profile.ph.max?.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-sm block text-gray-400">EC Setting</span>
                                <div className="flex items-center">
                                  <span>{profile.ec.target.toFixed(2)}</span>
                                  <span className="text-xs text-gray-400 ml-1">±{profile.ec.buffer.toFixed(2)} mS/cm</span>
                                </div>
                                <span className="text-xs text-gray-400">Range: {profile.ec.min?.toFixed(2)} - {profile.ec.max?.toFixed(2)} mS/cm</span>
                              </div>
                              <div>
                                <span className="text-sm block text-gray-400">Growth Schedule</span>
                                <span>{profile.schedule.length > 0 ? `${profile.schedule.length} weeks` : "No schedule"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'edit' && currentProfile && (
              <div className="mb-8">
                <div className="card mb-6">
                  <div className="card-header mb-4">
                    <h2 className="card-title">Profile Details</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm mb-2">Profile Name</label>
                      <input 
                        type="text" 
                        className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                        value={currentProfile.name}
                        onChange={(e) => setCurrentProfile({...currentProfile, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2">Crop Type</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-grow bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={categories.includes(currentProfile.cropType) ? currentProfile.cropType : "custom"}
                          onChange={(e) => {
                            if (e.target.value === "custom") {
                              setCurrentProfile({...currentProfile, cropType: ""});
                            } else {
                              setCurrentProfile({...currentProfile, cropType: e.target.value});
                            }
                          }}
                        >
                          {categories.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                          <option value="custom">Custom Category</option>
                        </select>
                        
                        {/* Show custom input field if "Custom" is selected */}
                        {!categories.includes(currentProfile.cropType) && (
                          <input 
                            type="text" 
                            className="flex-grow bg-[#1e1e1e] border border-[#333333] rounded p-2"
                            placeholder="Enter custom category"
                            value={currentProfile.cropType}
                            onChange={(e) => setCurrentProfile({...currentProfile, cropType: e.target.value})}
                          />
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-2">pH Settings</label>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs mb-1">Target pH</label>
                            <div className="flex items-center">
                              <input 
                                type="range" 
                                min="5.0" 
                                max="7.0" 
                                step="0.01" 
                                className="w-full mr-3"
                                value={currentProfile.ph.target}
                                onChange={(e) => {
                                  const targetValue = parseFloat(e.target.value);
                                  const buffer = currentProfile.ph.buffer;
                                  setCurrentProfile({
                                    ...currentProfile,
                                    ph: {
                                      ...currentProfile.ph, 
                                      target: targetValue,
                                      min: Math.round((targetValue - buffer) * 100) / 100,
                                      max: Math.round((targetValue + buffer) * 100) / 100
                                    }
                                  });
                                }}
                              />
                              <div className="flex items-center">
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-l"
                                  title="Decrease by 0.1"
                                  onClick={() => {
                                    const newValue = Math.max(5.0, parseFloat((currentProfile.ph.target - 0.1).toFixed(2)));
                                    const buffer = currentProfile.ph.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="8" x2="19" y2="8"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Decrease by 0.01"
                                  onClick={() => {
                                    const newValue = Math.max(5.0, parseFloat((currentProfile.ph.target - 0.01).toFixed(2)));
                                    const buffer = currentProfile.ph.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <div className="w-16 text-center px-2 py-1 bg-[#252525]">
                                  {currentProfile.ph.target.toFixed(2)}
                                </div>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Increase by 0.01"
                                  onClick={() => {
                                    const newValue = Math.min(7.0, parseFloat((currentProfile.ph.target + 0.01).toFixed(2)));
                                    const buffer = currentProfile.ph.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-r"
                                  title="Increase by 0.1"
                                  onClick={() => {
                                    const newValue = Math.min(7.0, parseFloat((currentProfile.ph.target + 0.1).toFixed(2)));
                                    const buffer = currentProfile.ph.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="16" x2="19" y2="16"></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="relative h-6 w-full bg-[#1e1e1e] rounded mt-2 overflow-hidden">
                              <div className="absolute inset-0 flex">
                                <div className="grow bg-red-500 opacity-20"></div>
                                <div className="grow bg-yellow-500 opacity-20"></div>
                                <div className="grow bg-green-500 opacity-20"></div>
                                <div className="grow bg-yellow-500 opacity-20"></div>
                                <div className="grow bg-red-500 opacity-20"></div>
                              </div>
                              <div 
                                className="absolute h-full bg-[#00a3e0] opacity-70 transition-all" 
                                style={{
                                  left: `${Math.max(0, (currentProfile.ph.target - currentProfile.ph.buffer - 5.0) / 2 * 100)}%`,
                                  width: `${(currentProfile.ph.buffer * 2) / 2 * 100}%`
                                }}
                              ></div>
                              <div 
                                className="absolute h-full w-1 bg-white" 
                                style={{
                                  left: `${(currentProfile.ph.target - 5.0) / 2 * 100}%`,
                                }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                              <span>5.0</span>
                              <span>5.5</span>
                              <span>6.0</span>
                              <span>6.5</span>
                              <span>7.0</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs mb-1">Buffer Zone (±)</label>
                            <div className="flex items-center">
                              <input 
                                type="range" 
                                min="0.01" 
                                max="1.0" 
                                step="0.01" 
                                className="w-full mr-3"
                                value={currentProfile.ph.buffer}
                                onChange={(e) => {
                                  const bufferValue = parseFloat(e.target.value);
                                  const target = currentProfile.ph.target;
                                  setCurrentProfile({
                                    ...currentProfile,
                                    ph: {
                                      ...currentProfile.ph, 
                                      buffer: Math.round(bufferValue * 100) / 100,
                                      min: Math.round((target - bufferValue) * 100) / 100,
                                      max: Math.round((target + bufferValue) * 100) / 100
                                    }
                                  });
                                }}
                              />
                              <div className="flex items-center">
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-l"
                                  title="Decrease by 0.1"
                                  onClick={() => {
                                    const newValue = Math.max(0.01, parseFloat((currentProfile.ph.buffer - 0.1).toFixed(2)));
                                    const target = currentProfile.ph.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="8" x2="19" y2="8"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Decrease by 0.01"
                                  onClick={() => {
                                    const newValue = Math.max(0.01, parseFloat((currentProfile.ph.buffer - 0.01).toFixed(2)));
                                    const target = currentProfile.ph.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <div className="w-16 text-center px-2 py-1 bg-[#252525]">
                                  {currentProfile.ph.buffer.toFixed(2)}
                                </div>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Increase by 0.01"
                                  onClick={() => {
                                    const newValue = Math.min(1.0, parseFloat((currentProfile.ph.buffer + 0.01).toFixed(2)));
                                    const target = currentProfile.ph.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-r"
                                  title="Increase by 0.1"
                                  onClick={() => {
                                    const newValue = Math.min(1.0, parseFloat((currentProfile.ph.buffer + 0.1).toFixed(2)));
                                    const target = currentProfile.ph.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ph: {
                                        ...currentProfile.ph, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="16" x2="19" y2="16"></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-[#333333]">
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-400">Resulting Range:</span>
                              <span className="text-xs font-medium">
                                {(currentProfile.ph.target - currentProfile.ph.buffer).toFixed(2)} - {(currentProfile.ph.target + currentProfile.ph.buffer).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm mb-2">EC Settings (mS/cm)</label>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs mb-1">Target EC</label>
                            <div className="flex items-center">
                              <input 
                                type="range" 
                                min="0.5" 
                                max="3.5" 
                                step="0.01" 
                                className="w-full mr-3"
                                value={currentProfile.ec.target}
                                onChange={(e) => {
                                  const targetValue = parseFloat(e.target.value);
                                  const buffer = currentProfile.ec.buffer;
                                  setCurrentProfile({
                                    ...currentProfile,
                                    ec: {
                                      ...currentProfile.ec, 
                                      target: targetValue,
                                      min: Math.round((targetValue - buffer) * 100) / 100,
                                      max: Math.round((targetValue + buffer) * 100) / 100
                                    }
                                  });
                                }}
                              />
                              <div className="flex items-center">
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-l"
                                  title="Decrease by 0.1"
                                  onClick={() => {
                                    const newValue = Math.max(0.5, parseFloat((currentProfile.ec.target - 0.1).toFixed(2)));
                                    const buffer = currentProfile.ec.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="8" x2="19" y2="8"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Decrease by 0.01"
                                  onClick={() => {
                                    const newValue = Math.max(0.5, parseFloat((currentProfile.ec.target - 0.01).toFixed(2)));
                                    const buffer = currentProfile.ec.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <div className="w-16 text-center px-2 py-1 bg-[#252525]">
                                  {currentProfile.ec.target.toFixed(2)}
                                </div>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Increase by 0.01"
                                  onClick={() => {
                                    const newValue = Math.min(3.5, parseFloat((currentProfile.ec.target + 0.01).toFixed(2)));
                                    const buffer = currentProfile.ec.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-r"
                                  title="Increase by 0.1"
                                  onClick={() => {
                                    const newValue = Math.min(3.5, parseFloat((currentProfile.ec.target + 0.1).toFixed(2)));
                                    const buffer = currentProfile.ec.buffer;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        target: newValue,
                                        min: Math.round((newValue - buffer) * 100) / 100,
                                        max: Math.round((newValue + buffer) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="16" x2="19" y2="16"></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="relative h-6 w-full bg-[#1e1e1e] rounded mt-2 overflow-hidden">
                              <div className="absolute inset-0 flex">
                                <div className="grow bg-yellow-500 opacity-20"></div>
                                <div className="grow bg-green-500 opacity-20"></div>
                                <div className="grow bg-yellow-500 opacity-20"></div>
                                <div className="grow bg-red-500 opacity-20"></div>
                              </div>
                              <div 
                                className="absolute h-full bg-[#00a3e0] opacity-70 transition-all" 
                                style={{
                                  left: `${Math.max(0, (currentProfile.ec.target - currentProfile.ec.buffer - 0.5) / 3 * 100)}%`,
                                  width: `${(currentProfile.ec.buffer * 2) / 3 * 100}%`
                                }}
                              ></div>
                              <div 
                                className="absolute h-full w-1 bg-white" 
                                style={{
                                  left: `${(currentProfile.ec.target - 0.5) / 3 * 100}%`,
                                }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                              <span>0.5</span>
                              <span>1.5</span>
                              <span>2.5</span>
                              <span>3.5</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs mb-1">Buffer Zone (±)</label>
                            <div className="flex items-center">
                              <input 
                                type="range" 
                                min="0.01" 
                                max="1.0" 
                                step="0.01" 
                                className="w-full mr-3"
                                value={currentProfile.ec.buffer}
                                onChange={(e) => {
                                  const bufferValue = parseFloat(e.target.value);
                                  const target = currentProfile.ec.target;
                                  setCurrentProfile({
                                    ...currentProfile,
                                    ec: {
                                      ...currentProfile.ec, 
                                      buffer: Math.round(bufferValue * 100) / 100,
                                      min: Math.round((target - bufferValue) * 100) / 100,
                                      max: Math.round((target + bufferValue) * 100) / 100
                                    }
                                  });
                                }}
                              />
                              <div className="flex items-center">
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-l"
                                  title="Decrease by 0.1"
                                  onClick={() => {
                                    const newValue = Math.max(0.01, parseFloat((currentProfile.ec.buffer - 0.1).toFixed(2)));
                                    const target = currentProfile.ec.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="8" x2="19" y2="8"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Decrease by 0.01"
                                  onClick={() => {
                                    const newValue = Math.max(0.01, parseFloat((currentProfile.ec.buffer - 0.01).toFixed(2)));
                                    const target = currentProfile.ec.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <div className="w-16 text-center px-2 py-1 bg-[#252525]">
                                  {currentProfile.ec.buffer.toFixed(2)}
                                </div>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center"
                                  title="Increase by 0.01"
                                  onClick={() => {
                                    const newValue = Math.min(1.0, parseFloat((currentProfile.ec.buffer + 0.01).toFixed(2)));
                                    const target = currentProfile.ec.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                  </svg>
                                </button>
                                <button 
                                  className="bg-[#1e1e1e] hover:bg-[#333] text-gray-300 w-8 h-8 flex items-center justify-center rounded-r"
                                  title="Increase by 0.1"
                                  onClick={() => {
                                    const newValue = Math.min(1.0, parseFloat((currentProfile.ec.buffer + 0.1).toFixed(2)));
                                    const target = currentProfile.ec.target;
                                    setCurrentProfile({
                                      ...currentProfile,
                                      ec: {
                                        ...currentProfile.ec, 
                                        buffer: newValue,
                                        min: Math.round((target - newValue) * 100) / 100,
                                        max: Math.round((target + newValue) * 100) / 100
                                      }
                                    });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <line x1="5" y1="16" x2="19" y2="16"></line>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-[#333333]">
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-400">Resulting Range:</span>
                              <span className="text-xs font-medium">
                                {(currentProfile.ec.target - currentProfile.ec.buffer).toFixed(2)} - {(currentProfile.ec.target + currentProfile.ec.buffer).toFixed(2)} mS/cm
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header mb-4 flex justify-between">
                    <h2 className="card-title">Growth Schedule Builder</h2>
                    <div className="flex items-center">
                      <select 
                        className="bg-[#1e1e1e] border border-[#333333] rounded p-1 text-sm mr-2"
                        id="schedule-template"
                      >
                        <option value="custom">Custom Schedule</option>
                        <option value="4">4-Week Cycle</option>
                        <option value="8">8-Week Cycle</option>
                        <option value="12">12-Week Cycle</option>
                      </select>
                      <button 
                        className="btn"
                        onClick={() => {
                          const scheduleLength = parseInt((document.getElementById('schedule-template') as HTMLSelectElement).value);
                          if (!isNaN(scheduleLength)) {
                            const generatedSchedule = generateGrowthSchedule(currentProfile.cropType, scheduleLength);
                            setCurrentProfile({...currentProfile, schedule: generatedSchedule});
                          }
                        }}
                      >
                        Generate Schedule
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex mb-2">
                      <div className="w-1/6 px-2 font-medium text-sm">Week</div>
                      <div className="w-1/4 px-2 font-medium text-sm">Growth Phase</div>
                      <div className="w-1/4 px-2 font-medium text-sm">pH / EC</div>
                      <div className="w-1/3 px-2 font-medium text-sm">Actions</div>
                    </div>
                    
                    {currentProfile.schedule.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-[#333333] rounded">
                        <p className="text-gray-400 mb-2">No growth schedule defined yet</p>
                        <button 
                          className="btn"
                          onClick={() => setShowNewWeekModal(true)}
                        >
                          Add First Week
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentProfile.schedule.map((week, idx) => (
                          <div key={idx} className="flex flex-col bg-[#1e1e1e] p-2 rounded">
                            <div className="flex items-center">
                              <div className="w-1/6 px-2 font-medium">Week {week.week}</div>
                              <div className="w-1/4 px-2">{week.growthPhase}</div>
                              <div className="w-1/4 px-2">
                                <div className="text-xs">pH: {week.ph.target.toFixed(2)} ±{week.ph.buffer.toFixed(2)}</div>
                                <div className="text-xs">EC: {week.ec.target.toFixed(2)} ±{week.ec.buffer.toFixed(2)}</div>
                              </div>
                              <div className="w-1/3 px-2 flex justify-end">
                                <button 
                                  className="btn btn-sm mr-2"
                                  onClick={() => handleEditWeek(idx)}
                                >
                                  Edit
                                </button>
                                <button 
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => {
                                    const newSchedule = [...currentProfile.schedule];
                                    newSchedule.splice(idx, 1);
                                    // Renumber weeks
                                    newSchedule.forEach((w, i) => {
                                      w.week = i + 1;
                                    });
                                    setCurrentProfile({...currentProfile, schedule: newSchedule});
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            
                            {/* Nutrient dosages for this week */}
                            {week.pumpDosages && week.pumpDosages.length > 0 && (
                              <div className="mt-2 pl-2 pt-2 border-t border-[#333333]">
                                <div className="text-xs text-gray-400 mb-1">Nutrient Dosages:</div>
                                <div className="flex flex-wrap gap-2">
                                  {week.pumpDosages
                                    .filter(d => d.dosage > 0)
                                    .map((dosage, i) => (
                                      <div key={i} className="text-xs bg-[#252525] px-2 py-1 rounded">
                                        {dosage.pumpName}: {dosage.dosage} ml/L
                                      </div>
                                  ))}
                                  {!week.pumpDosages.some(d => d.dosage > 0) && (
                                    <div className="text-xs italic text-gray-500">No nutrients defined</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="text-center mt-4">
                          <button 
                            className="btn"
                            onClick={() => setShowNewWeekModal(true)}
                          >
                            Add Week
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Nutrient Pumps Section */}
                <div className="card mt-6">
                  <div className="card-header mb-4 flex justify-between">
                    <h2 className="card-title">Assigned Nutrient Pumps</h2>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm mr-1">Growth Phase:</label>
                      <select 
                        className="bg-[#1e1e1e] border border-[#333333] rounded p-1 text-sm mr-2"
                        value={growthPhase}
                        onChange={(e) => setGrowthPhase(e.target.value)}
                      >
                        <option value="Seedling">Seedling</option>
                        <option value="Vegetative">Vegetative</option>
                        <option value="Early Flower">Early Flower</option>
                        <option value="Mid Flower">Mid Flower</option>
                        <option value="Late Flower">Late Flower</option>
                        <option value="Ripening">Ripening</option>
                        <option value="Flush">Flush</option>
                      </select>
                      <button 
                        className="btn btn-sm" 
                        onClick={() => {
                          if (editingWeekIndex !== null && currentProfile) {
                            // Copy current profile dosages to the selected week
                            const newSchedule = [...currentProfile.schedule];
                            const updatedWeek = {...newSchedule[editingWeekIndex]};
                            
                            updatedWeek.pumpDosages = currentProfile.pumpAssignments.map(assignment => ({
                              ...assignment
                            }));
                            
                            newSchedule[editingWeekIndex] = updatedWeek;
                            setCurrentProfile({...currentProfile, schedule: newSchedule});
                            alert("Profile dosages copied to Week " + updatedWeek.week);
                          } else {
                            alert("Please select a week first");
                          }
                        }}
                        disabled={editingWeekIndex === null}
                      >
                        Copy Profile Dosages to Week
                      </button>
                    </div>
                  </div>
                  
                  {pumpsLoading ? (
                    <div className="animate-pulse text-center py-4">
                      <p>Loading pump data...</p>
                    </div>
                  ) : pumpsWithNutrients.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-400 mb-2">No pumps with nutrients available</p>
                      <Link href="/pumps" className="btn">
                        Assign Nutrients to Pumps
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pumpsWithNutrients.map((pump) => (
                        <div key={pump.name} className="flex items-center justify-between p-2 bg-[#252525] rounded-lg">
                          <div className="flex items-center">
                            <input 
                              type="checkbox" 
                              id={`pump-${pump.name}`}
                              className="mr-3 h-4 w-4 bg-[#1e1e1e] border border-[#333333] rounded"
                              checked={currentProfile?.pumpAssignments?.some(p => p.pumpName === pump.name) || false}
                              onChange={(e) => {
                                if (!currentProfile) return;
                                
                                const newProfile = {...currentProfile};
                                if (!newProfile.pumpAssignments) {
                                  newProfile.pumpAssignments = [];
                                }
                                
                                if (e.target.checked) {
                                  // Add pump to assignments if not already there
                                  if (!newProfile.pumpAssignments.some(p => p.pumpName === pump.name)) {
                                    const assignment = {
                                      pumpName: pump.name,
                                      dosage: 0,
                                      nutrientId: pump.nutrient?.productId,
                                      brandId: pump.nutrient?.brandId,
                                      productName: pump.nutrient?.productName,
                                      brandName: pump.nutrient?.brandName,
                                      isAutoDosage: false
                                    };
                                    
                                    newProfile.pumpAssignments.push(assignment);
                                  }
                                } else {
                                  // Remove pump from assignments
                                  newProfile.pumpAssignments = newProfile.pumpAssignments.filter(
                                    p => p.pumpName !== pump.name
                                  );
                                }
                                
                                setCurrentProfile(newProfile);
                              }}
                            />
                            <label htmlFor={`pump-${pump.name}`} className="flex flex-col cursor-pointer">
                              <span className="font-medium">{pump.name}</span>
                              <span className="text-sm text-gray-400">
                                {pump.nutrient ? `${pump.nutrient.brandName || 'Unknown'} - ${pump.nutrient.productName || 'Unknown'}` : 'No nutrient'}
                              </span>
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input 
                              type="number" 
                              className={`w-20 bg-[#1e1e1e] border border-[#333333] rounded p-2 text-center mr-2 ${
                                currentProfile?.pumpAssignments?.find(p => p.pumpName === pump.name)?.isAutoDosage 
                                  ? 'border-[#00a3e0] border-2' 
                                  : ''
                              }`}
                              placeholder="0"
                              min="0"
                              step="0.01"
                              value={currentProfile?.pumpAssignments?.find(p => p.pumpName === pump.name)?.dosage || ""}
                              onChange={(e) => {
                                if (!currentProfile) return;
                                
                                const dosage = parseFloat(e.target.value) || 0;
                                const newProfile = {...currentProfile};
                                
                                if (!newProfile.pumpAssignments) {
                                  newProfile.pumpAssignments = [];
                                }
                                
                                const assignment = newProfile.pumpAssignments.find(
                                  p => p.pumpName === pump.name
                                );
                                
                                if (assignment) {
                                  assignment.dosage = dosage;
                                } else {
                                  newProfile.pumpAssignments.push({
                                    pumpName: pump.name,
                                    dosage,
                                    nutrientId: pump.nutrient?.productId,
                                    brandId: pump.nutrient?.brandId,
                                    productName: pump.nutrient?.productName,
                                    brandName: pump.nutrient?.brandName,
                                    isAutoDosage: false
                                  });
                                }
                                
                                setCurrentProfile(newProfile);
                              }}
                            />
                            <span className="text-sm text-gray-400">ml/L</span>
                          </div>
                        </div>
                      ))}
                      
                      {currentProfile?.pumpAssignments?.some(p => p.isAutoDosage) && (
                        <div className="bg-[#252525] p-2 rounded mt-2 text-xs text-[#00a3e0]">
                          <div className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="8" x2="12" y2="12"></line>
                              <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            Auto-calculated dosages are highlighted. Manual adjustments will override automatic calculations.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <div className="w-full bg-[#1e1e1e] rounded-lg p-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Growth Timeline</span>
                      <span className="text-xs text-gray-400">Total: {currentProfile.schedule.length} weeks</span>
                    </div>
                    <div className="relative w-full h-16 flex">
                      {currentProfile.schedule.map((week, index) => (
                        <div 
                          key={index} 
                          className="grow border-r border-[#333333] relative cursor-pointer hover:bg-[#252525]"
                          onClick={() => handleEditWeek(index)}
                        >
                          <div className="absolute top-0 left-0 right-0 h-2 bg-[#00a3e0]" style={{opacity: 0.3 + (0.7 * (index / currentProfile.schedule.length))}}></div>
                          <div className="text-center pt-3">
                            <div className="text-xs">{week.growthPhase}</div>
                            <div className="text-xs text-gray-400">Week {week.week}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#252525] rounded">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Recommended Nutrients for {currentProfile.cropType}</span>
                    <button 
                      className="text-xs text-[#00a3e0]"
                      onClick={() => {
                        if (!currentProfile) return;
                        
                        // Get recommended nutrients for this crop type
                        const nutrients = getRecommendedNutrients(currentProfile.cropType);
                        
                        // Create pump assignments based on available pumps
                        const newProfile = {...currentProfile};
                        
                        // Initialize pump assignments if needed
                        if (!newProfile.pumpAssignments) {
                          newProfile.pumpAssignments = [];
                        }
                        
                        // Try to match pumps with nutrients by name similarity
                        nutrients.forEach(nutrient => {
                          // Find pumps that might match this nutrient
                          const matchingPump = pumpsWithNutrients.find(pump => 
                            pump.nutrient?.productName?.toLowerCase().includes(nutrient.name.toLowerCase())
                          );
                          
                          if (matchingPump) {
                            // Check if this pump is already assigned
                            const existingAssignment = newProfile.pumpAssignments.find(
                              a => a.pumpName === matchingPump.name
                            );
                            
                            if (existingAssignment) {
                              // Update existing assignment
                              existingAssignment.dosage = nutrient.dosage;
                              existingAssignment.isAutoDosage = true;
                            } else {
                              // Create new assignment
                              newProfile.pumpAssignments.push({
                                pumpName: matchingPump.name,
                                dosage: nutrient.dosage,
                                nutrientId: matchingPump.nutrient?.productId,
                                brandId: matchingPump.nutrient?.brandId,
                                productName: matchingPump.nutrient?.productName,
                                brandName: matchingPump.nutrient?.brandName,
                                isAutoDosage: true
                              });
                            }
                          }
                        });
                        
                        setCurrentProfile(newProfile);
                      }}
                    >
                      Apply All
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recommendedNutrients.map((nutrient, index) => (
                      <div key={index} className="flex justify-between items-center py-1 border-b border-[#333333]">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-[#00a3e0] mr-2"></div>
                          <span>{nutrient.name}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm mr-2">{nutrient.dosage} ml/L</span>
                          <button 
                            className="text-xs px-2 py-1 bg-[#1e1e1e] rounded"
                            onClick={() => {
                              if (!currentProfile) return;
                              
                              // Find a matching pump for this nutrient
                              const matchingPump = pumpsWithNutrients.find(pump => 
                                pump.nutrient?.productName?.toLowerCase().includes(nutrient.name.toLowerCase())
                              );
                              
                              if (matchingPump) {
                                const newProfile = {...currentProfile};
                                
                                // Initialize pump assignments if needed
                                if (!newProfile.pumpAssignments) {
                                  newProfile.pumpAssignments = [];
                                }
                                
                                // Check if this pump is already assigned
                                const existingAssignment = newProfile.pumpAssignments.find(
                                  a => a.pumpName === matchingPump.name
                                );
                                
                                if (existingAssignment) {
                                  // Update existing assignment
                                  existingAssignment.dosage = nutrient.dosage;
                                  existingAssignment.isAutoDosage = true;
                                } else {
                                  // Create new assignment
                                  newProfile.pumpAssignments.push({
                                    pumpName: matchingPump.name,
                                    dosage: nutrient.dosage,
                                    nutrientId: matchingPump.nutrient?.productId,
                                    brandId: matchingPump.nutrient?.brandId,
                                    productName: matchingPump.nutrient?.productName,
                                    brandName: matchingPump.nutrient?.brandName,
                                    isAutoDosage: true
                                  });
                                }
                                
                                setCurrentProfile(newProfile);
                              } else {
                                alert(`No pump found for ${nutrient.name}. Please assign a nutrient to a pump first.`);
                              }
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* New Week Modal */}
        {showNewWeekModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-[#1e1e1e] rounded-lg p-6 w-full max-w-lg">
              <h2 className="text-xl font-bold mb-4">Add New Week</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm mb-2">Week Number</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                    min="1"
                    value={currentProfile?.schedule?.length ? currentProfile.schedule.length + 1 : 1}
                    readOnly
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2">pH Settings</label>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs mb-1">Target pH</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile?.ph?.target || 6.0}
                          step="0.01"
                          id="new-week-ph-target"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Buffer Zone (±)</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile?.ph?.buffer || 0.2}
                          step="0.01"
                          min="0.01"
                          id="new-week-ph-buffer"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-2">EC Settings (mS/cm)</label>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs mb-1">Target EC</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile?.ec?.target || 1.2}
                          step="0.01"
                          id="new-week-ec-target"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Buffer Zone (±)</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile?.ec?.buffer || 0.2}
                          step="0.01"
                          min="0.01"
                          id="new-week-ec-buffer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm mb-2">Growth Phase</label>
                  <select 
                    className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                    defaultValue="Vegetative"
                    id="new-week-growth-phase"
                  >
                    <option value="Seedling">Seedling</option>
                    <option value="Vegetative">Vegetative</option>
                    <option value="Early Flower">Early Flower</option>
                    <option value="Mid Flower">Mid Flower</option>
                    <option value="Late Flower">Late Flower</option>
                    <option value="Ripening">Ripening</option>
                    <option value="Flush">Flush</option>
                  </select>
                </div>
              </div>
              
              {pumpsWithNutrients.length > 0 && (
                <div>
                  <label className="block text-sm mb-2">Nutrient Dosages</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pumpsWithNutrients.map((pump) => (
                      <div key={pump.name} className="flex items-center justify-between p-2 bg-[#252525] rounded-lg">
                        <div className="flex items-center">
                          <label className="text-sm">
                            {pump.name} ({pump.nutrient ? `${pump.nutrient.productName}` : 'No nutrient'})
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input 
                            type="number" 
                            className="w-20 bg-[#1e1e1e] border border-[#333333] rounded p-2 text-center mr-2"
                            placeholder="0"
                            min="0"
                            step="0.01"
                            defaultValue={0}
                            id={`new-week-pump-${pump.name}`}
                          />
                          <span className="text-sm text-gray-400">ml/L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowNewWeekModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={() => {
                    if (currentProfile) {
                      const phTarget = parseFloat((document.getElementById('new-week-ph-target') as HTMLInputElement).value);
                      const phBuffer = parseFloat((document.getElementById('new-week-ph-buffer') as HTMLInputElement).value);
                      const ecTarget = parseFloat((document.getElementById('new-week-ec-target') as HTMLInputElement).value);
                      const ecBuffer = parseFloat((document.getElementById('new-week-ec-buffer') as HTMLInputElement).value);
                      const weekGrowthPhase = (document.getElementById('new-week-growth-phase') as HTMLSelectElement).value;
                      
                      // Collect pump dosages
                      const weekPumpDosages = pumpsWithNutrients.map(pump => {
                        const inputElem = document.getElementById(`new-week-pump-${pump.name}`) as HTMLInputElement;
                        const dosage = parseFloat(inputElem?.value || "0") || 0;
                        
                        return {
                          pumpName: pump.name,
                          dosage,
                          nutrientId: pump.nutrient?.productId,
                          brandId: pump.nutrient?.brandId,
                          productName: pump.nutrient?.productName,
                          brandName: pump.nutrient?.brandName,
                          isAutoDosage: false
                        };
                      });
                      
                      const newWeek: WeekSchedule = {
                        week: currentProfile.schedule.length + 1,
                        ph: { 
                          target: phTarget, 
                          buffer: phBuffer,
                          min: Math.round((phTarget - phBuffer) * 100) / 100,
                          max: Math.round((phTarget + phBuffer) * 100) / 100
                        },
                        ec: { 
                          target: ecTarget, 
                          buffer: ecBuffer,
                          min: Math.round((ecTarget - ecBuffer) * 100) / 100,
                          max: Math.round((ecTarget + ecBuffer) * 100) / 100
                        },
                        pumpSettings: [],
                        pumpDosages: weekPumpDosages,
                        growthPhase: weekGrowthPhase
                      };
                      
                      const newSchedule = [...currentProfile.schedule, newWeek];
                      setCurrentProfile({...currentProfile, schedule: newSchedule});
                      setShowNewWeekModal(false);
                    }
                  }}
                >
                  Add Week
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Edit Week Modal */}
        {editingWeekIndex !== null && currentProfile && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-[#1e1e1e] rounded-lg p-6 w-full max-w-lg">
              <h2 className="text-xl font-bold mb-4">Edit Week {currentProfile.schedule[editingWeekIndex].week}</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm mb-2">Week Number</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                    min="1"
                    value={currentProfile.schedule[editingWeekIndex].week}
                    readOnly
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2">pH Settings</label>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs mb-1">Target pH</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile.schedule[editingWeekIndex].ph.target}
                          step="0.01"
                          id="edit-week-ph-target"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Buffer Zone (±)</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile.schedule[editingWeekIndex].ph.buffer}
                          step="0.01"
                          min="0.01"
                          id="edit-week-ph-buffer"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-2">EC Settings (mS/cm)</label>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs mb-1">Target EC</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile.schedule[editingWeekIndex].ec.target}
                          step="0.01"
                          id="edit-week-ec-target"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Buffer Zone (±)</label>
                        <input 
                          type="number" 
                          className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                          defaultValue={currentProfile.schedule[editingWeekIndex].ec.buffer}
                          step="0.01"
                          min="0.01"
                          id="edit-week-ec-buffer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm mb-2">Growth Phase</label>
                  <select 
                    className="w-full bg-[#121212] border border-[#333333] rounded p-2"
                    defaultValue={currentProfile.schedule[editingWeekIndex].growthPhase}
                    id="edit-week-growth-phase"
                  >
                    <option value="Seedling">Seedling</option>
                    <option value="Vegetative">Vegetative</option>
                    <option value="Early Flower">Early Flower</option>
                    <option value="Mid Flower">Mid Flower</option>
                    <option value="Late Flower">Late Flower</option>
                    <option value="Ripening">Ripening</option>
                    <option value="Flush">Flush</option>
                  </select>
                </div>
              </div>
              
              {pumpsWithNutrients.length > 0 && (
                <div>
                  <label className="block text-sm mb-2">Nutrient Dosages for Week {currentProfile.schedule[editingWeekIndex].week}</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pumpsWithNutrients.map((pump) => {
                      const weekDosage = currentProfile.schedule[editingWeekIndex].pumpDosages?.find(
                        p => p.pumpName === pump.name
                      )?.dosage || 0;
                      
                      return (
                        <div key={pump.name} className="flex items-center justify-between p-2 bg-[#252525] rounded-lg">
                          <div className="flex items-center">
                            <label className="text-sm">
                              {pump.name} ({pump.nutrient ? `${pump.nutrient.productName}` : 'No nutrient'})
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input 
                              type="number" 
                              className="w-20 bg-[#1e1e1e] border border-[#333333] rounded p-2 text-center mr-2"
                              placeholder="0"
                              min="0"
                              step="0.01"
                              defaultValue={weekDosage}
                              id={`edit-week-pump-${pump.name}`}
                            />
                            <span className="text-sm text-gray-400">ml/L</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setEditingWeekIndex(null)}
                >
                  Cancel
                </button>
                <button 
                  className="btn"
                  onClick={() => {
                    if (currentProfile) {
                      const phTarget = parseFloat((document.getElementById('edit-week-ph-target') as HTMLInputElement).value);
                      const phBuffer = parseFloat((document.getElementById('edit-week-ph-buffer') as HTMLInputElement).value);
                      const ecTarget = parseFloat((document.getElementById('edit-week-ec-target') as HTMLInputElement).value);
                      const ecBuffer = parseFloat((document.getElementById('edit-week-ec-buffer') as HTMLInputElement).value);
                      const weekGrowthPhase = (document.getElementById('edit-week-growth-phase') as HTMLSelectElement).value;
                      
                      // Collect pump dosages
                      const weekPumpDosages = pumpsWithNutrients.map(pump => {
                        const inputElem = document.getElementById(`edit-week-pump-${pump.name}`) as HTMLInputElement;
                        const dosage = parseFloat(inputElem?.value || "0") || 0;
                        
                        return {
                          pumpName: pump.name,
                          dosage,
                          nutrientId: pump.nutrient?.productId,
                          brandId: pump.nutrient?.brandId,
                          productName: pump.nutrient?.productName,
                          brandName: pump.nutrient?.brandName,
                          isAutoDosage: false
                        };
                      });
                      
                      const updatedWeek: WeekSchedule = {
                        ...currentProfile.schedule[editingWeekIndex],
                        ph: { 
                          target: phTarget, 
                          buffer: phBuffer,
                          min: Math.round((phTarget - phBuffer) * 100) / 100,
                          max: Math.round((phTarget + phBuffer) * 100) / 100
                        },
                        ec: { 
                          target: ecTarget, 
                          buffer: ecBuffer,
                          min: Math.round((ecTarget - ecBuffer) * 100) / 100,
                          max: Math.round((ecTarget + ecBuffer) * 100) / 100
                        },
                        pumpDosages: weekPumpDosages,
                        growthPhase: weekGrowthPhase
                      };
                      
                      const newSchedule = [...currentProfile.schedule];
                      newSchedule[editingWeekIndex] = updatedWeek;
                      
                      setCurrentProfile({...currentProfile, schedule: newSchedule});
                      setEditingWeekIndex(null);
                    }
                  }}
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
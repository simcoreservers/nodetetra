# autoDosing.ts Improvement Plan

## Critical Improvements

1. **Error Resilience**
   - Implement exponential backoff for sensor failures
   - Add circuit breaker pattern to prevent cascading failures
   - Sanitize inputs with stronger validation

2. **Performance Optimization**
   - Implement caching for getActiveProfile()
   - Reduce redundant disk I/O operations
   - Replace synchronous file operations with async alternatives

3. **Dosing Accuracy**
   - Implement PID controller for pH adjustments
   - Add ML-based predictive dosing algorithm
   - Create adaptive dosing based on historical effectiveness

4. **Code Architecture**
   - Extract dosing types to dedicated modules
   - Implement dependency injection for testing
   - Add proper TypeScript discriminated unions for result types

5. **Logging & Monitoring**
   - Add structured logging for better analytics
   - Implement telemetry for dose effectiveness tracking
   - Add time-series statistics for calibration

## Implementation Details

### 1. PID Controller Implementation

```typescript
// Add to the top of the file
interface PIDController {
  kp: number;  // Proportional gain
  ki: number;  // Integral gain
  kd: number;  // Derivative gain
  integral: number;
  lastError: number;
  lastTime: number;
}

// PID controller setup in dosingConfig
const PID_DEFAULTS = {
  ph: { kp: 0.5, ki: 0.1, kd: 0.2, integral: 0, lastError: 0, lastTime: 0 },
  ec: { kp: 0.3, ki: 0.05, kd: 0.1, integral: 0, lastError: 0, lastTime: 0 }
};

// Add pidControllers to DosingConfig interface and DEFAULT_DOSING_CONFIG
pidControllers: {
  ph: PIDController;
  ec: PIDController;
}
```

### 2. Optimized Profile Loading

```typescript
// Add cache for active profile
let activeProfileCache: any = null;
let profileCacheTime: number = 0;
const PROFILE_CACHE_TTL = 60000; // 1 minute

async function getActiveProfileOptimized() {
  const now = Date.now();
  
  // Return cached profile if still valid
  if (activeProfileCache && (now - profileCacheTime) < PROFILE_CACHE_TTL) {
    trace(MODULE, 'Using cached active profile');
    return activeProfileCache;
  }
  
  // Get fresh profile
  const profile = await getActiveProfile();
  if (profile) {
    activeProfileCache = profile;
    profileCacheTime = now;
  }
  
  return profile;
}
```

### 3. Improved Dosing Logic

```typescript
// Calculate dose with PID controller
function calculatePHDose(current: number, target: number, controller: PIDController): number {
  const now = Date.now();
  const dt = (now - controller.lastTime) / 1000; // Time delta in seconds
  
  // Skip integral if first run
  if (controller.lastTime === 0) {
    controller.lastTime = now;
    controller.lastError = target - current;
    return dosingConfig.dosing.phUp.doseAmount; // Default dose
  }
  
  const error = target - current;
  controller.integral += error * dt;
  const derivative = (error - controller.lastError) / dt;
  
  const output = controller.kp * error + 
                 controller.ki * controller.integral + 
                 controller.kd * derivative;
  
  controller.lastError = error;
  controller.lastTime = now;
  
  // Convert controller output to actual dose amount (ml)
  const baseDose = error > 0 ? 
    dosingConfig.dosing.phUp.doseAmount : 
    dosingConfig.dosing.phDown.doseAmount;
  
  return Math.abs(baseDose * output);
}
```

### 4. Telemetry System

```typescript
interface DoseEffectiveness {
  timestamp: string;
  pumpName: string;
  doseAmount: number;
  beforeValue: number; // pH or EC
  afterValue: number;  // pH or EC after stabilization
  effectivenessRatio: number; // Change per ml
}

// In performAutoDosing, before returning results:
if (result.action === 'dosed') {
  // Schedule effectiveness measurement
  setTimeout(async () => {
    try {
      const currentReadings = isSensorSimulation ? 
        await getSimulatedSensorReadings() : 
        await getAllSensorReadings();
      
      recordDoseEffectiveness({
        timestamp: new Date().toISOString(),
        pumpName: result.details.pumpName,
        doseAmount: result.details.amount,
        beforeValue: sensorData[result.details.type === 'pH Up' || result.details.type === 'pH Down' ? 'ph' : 'ec'],
        afterValue: currentReadings[result.details.type === 'pH Up' || result.details.type === 'pH Down' ? 'ph' : 'ec'],
        effectivenessRatio: 0 // Calculate in function
      });
    } catch (err) {
      error(MODULE, 'Error recording dose effectiveness', err);
    }
  }, 300000); // Check after 5 minutes
}
```
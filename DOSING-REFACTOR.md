# NuTetra Dosing System Refactor

## Changes Made

- Consolidated auto-dosing and dosing systems into unified API
- Added PID controller for adaptive dosing
- Implemented error resilience with circuit breaker pattern
- Optimized API response times with caching
- Added telemetry for dose effectiveness tracking
- Created React hook for unified frontend integration

## Directory Structure

```
/api/dosing             - Main unified dosing API
/api/dosing/auto        - Auto-dosing operations
/api/dosing/manual      - Manual pump operations
/api/dosing/targets     - pH/EC target management
/api/dosing/calibration - Pump calibration
```

## Migration Process

Run migration script to consolidate existing configuration:

```bash
npm run migrate-dosing
```

This script:
1. Preserves all existing settings
2. Creates unified configuration
3. Makes backups of original files

## Integration

### Frontend

Replace existing hooks:

```typescript
// OLD: 
import { useAutoDosing } from '@/app/hooks/useAutoDosing';
import { useDosingData } from '@/app/hooks/useDosingData';

// NEW:
import { useUnifiedDosing } from '@/app/hooks/useUnifiedDosing';

// Usage
const {
  config,
  triggerAutoDosing,
  manualDosing,
  updateTargets,
  calibratePump
} = useUnifiedDosing();
```

### API Endpoints

Legacy endpoints are still available but deprecated:
- `/api/autodosing`
- `/api/dosing/target-ph`
- `/api/dosing/target-ec`

These will be removed in a future update.

## Storage Format

The unified system uses a single storage file:
- `data/dosing-config.json`

## Implementation Details

For full implementation details:
- Review `dosingMigration.ts`
- See `api/dosing/auto/route.ts` for PID controller

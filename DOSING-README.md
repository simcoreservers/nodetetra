# Dosing System Unification

## Completed Migration

The dosing system has been fully migrated to a unified approach. All legacy components have been archived.

### Key Changes:

1. **Data Storage**
   - Single configuration file: `data/dosing-config.json`
   - Legacy files backed up (.bak extension)

2. **API Endpoints**
   - Primary: `/api/dosing` - Main unified API
   - Subpaths:
     - `/api/dosing/auto` - Automated dosing operations
     - `/api/dosing/manual` - Manual pump control
     - `/api/dosing/targets` - pH/EC target management
     - `/api/dosing/calibration` - Pump calibration

3. **React Hook**
   - Use `useUnifiedDosing` for all dosing operations
   - Provides complete API surface with improved type safety

4. **Redirects**
   - Legacy endpoints now redirect to unified API
   - Preserves backward compatibility

## Default Settings

- Automated dosing: **Disabled by default** (safety feature)
- User must explicitly enable via UI
- Configured pump intervals preserved during migration

## Removed Components

- Migration scripts no longer needed (data already migrated)
- Legacy API endpoints archived
- Legacy React hooks archived

## Testing

Test plan:
1. Verify dosing settings page loads correctly
2. Confirm pH/EC targets display properly
3. Test enabling/disabling automated dosing
4. Validate manual dosing operation
5. Check interval changes are preserved

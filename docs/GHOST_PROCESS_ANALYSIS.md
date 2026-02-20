# Ghost Process Root Cause Analysis & Fix

## Problem Summary
The Task Manager was freezing after the launcher (Hytale-F2P) ran. This was caused by **ghost/zombie PowerShell processes** spawned on Windows that were not being properly cleaned up.

## Root Cause

### Location
**File:** `backend/utils/platformUtils.js`

**Functions affected:**
1. `detectGpuWindows()` - Called during app startup and game launch
2. `getSystemTypeWindows()` - Called during system detection

### The Issue
Both functions were using **`execSync()`** to run PowerShell commands for GPU and system type detection:

```javascript
// PROBLEMATIC CODE
output = execSync(
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_VideoController..."',
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
);
```

#### Why This Causes Ghost Processes

1. **execSync spawns a shell process** - On Windows, `execSync` with a string command spawns `cmd.exe` which then launches `powershell.exe`
2. **PowerShell inherits stdio settings** - The `stdio: ['ignore', 'pipe', 'ignore']` doesn't fully detach the PowerShell subprocess
3. **Process hierarchy issue** - Even though the Node.js process receives the output and continues, the PowerShell subprocess may remain as a child process
4. **Windows job object limitation** - Node.js child_process doesn't always properly terminate all descendants on Windows
5. **Multiple calls during initialization** - GPU detection runs:
   - During app startup (line 1057 in main.js)
   - During game launch (in gameLauncher.js)
   - During settings UI rendering
   
   Each call can spawn 2-3 PowerShell processes, and if the app spawns multiple game instances or restarts, these accumulate

### Call Stack
1. `main.js` app startup → calls `detectGpu()` 
2. `gameLauncher.js` on launch → calls `setupGpuEnvironment()` → calls `detectGpu()`
3. Multiple PowerShell processes spawn but aren't cleaned up properly
4. Task Manager accumulates these ghost processes and becomes unresponsive

## The Solution

Replace `execSync()` with `spawnSync()` and add explicit timeouts:

### Key Changes

#### 1. Import spawnSync
```javascript
const { execSync, spawnSync } = require('child_process');
```

#### 2. Replace execSync with spawnSync in detectGpuWindows()
```javascript
const POWERSHELL_TIMEOUT = 5000; // 5 second timeout

const result = spawnSync('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command',
  'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Csv -NoTypeInformation'
], {
  encoding: 'utf8',
  timeout: POWERSHELL_TIMEOUT,
  stdio: ['ignore', 'pipe', 'ignore'],
  windowsHide: true
});
```

#### 3. Apply same fix to getSystemTypeWindows()

### Why spawnSync Fixes This

1. **Direct process spawn** - `spawnSync()` directly spawns the executable without going through `cmd.exe`
2. **Explicit timeout** - The `timeout` parameter ensures processes are forcibly terminated after 5 seconds
3. **windowsHide: true** - Prevents PowerShell window flashing and better resource cleanup
4. **Better cleanup** - Node.js has better control over process lifecycle with `spawnSync`
5. **Proper exit handling** - spawnSync waits for and properly cleans up the process before returning

### Benefits

- ✅ PowerShell processes are guaranteed to terminate within 5 seconds
- ✅ No more ghost processes accumulating
- ✅ Task Manager stays responsive
- ✅ Fallback mechanisms still work (wmic, Get-WmiObject, Get-CimInstance)
- ✅ Performance improvement (spawnSync is faster for simple commands)

## Testing

To verify the fix:

1. **Before running the launcher**, open Task Manager and check for PowerShell processes (should be 0 or 1)
2. **Start the launcher** and observe Task Manager - you should not see PowerShell processes accumulating
3. **Launch the game** and check Task Manager - still no ghost PowerShell processes
4. **Restart the launcher** multiple times - PowerShell process count should remain stable

Expected behavior: No PowerShell processes should remain after each operation completes.

## Files Modified

- **`backend/utils/platformUtils.js`**
  - Line 1: Added `spawnSync` import
  - Lines 300-380: Refactored `detectGpuWindows()` 
  - Lines 599-643: Refactored `getSystemTypeWindows()`

## Performance Impact

- ⚡ **Faster execution** - `spawnSync` with argument arrays is faster than shell string parsing
- 🎯 **More reliable** - Explicit timeout prevents indefinite hangs
- 💾 **Lower memory usage** - Processes properly cleaned up instead of becoming zombies

## Additional Notes

The fix maintains backward compatibility:
- All three GPU detection methods still work (Get-CimInstance → Get-WmiObject → wmic)
- Error handling is preserved
- System type detection (laptop vs desktop) still functions correctly
- No changes to public API or external behavior

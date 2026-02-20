# UUID/Skin Reset Bug Fix Plan

## Problem Summary

Players experience random skin/cosmetic resets without intentionally changing anything. The root cause is that the UUID system has multiple failure points that can silently generate new UUIDs or use the wrong UUID during gameplay.

**Impact**: Players lose their customized cosmetics/skins randomly, causing frustration and confusion.

**Status**: ✅ **FIXED** - All critical and high priority bugs have been addressed.

---

## Implementation Summary

### What Was Fixed

| Bug | Severity | Status | Description |
|-----|----------|--------|-------------|
| BUG-001 | Critical | ✅ Fixed | Username not loaded before play click |
| BUG-002 | High | ✅ Fixed | isFirstLaunch() always returns true |
| BUG-003 | Critical | ✅ Fixed | Silent config corruption returns empty object |
| BUG-004 | Critical | ✅ Fixed | Non-atomic config writes |
| BUG-005 | High | ✅ Fixed | Username fallback to 'Player' |
| BUG-006 | Medium | ✅ Fixed | Launch overwrites username every time |
| BUG-007 | Medium | ✅ Fixed | Dual UUID systems (playerManager vs config) |
| BUG-008 | High | ✅ Fixed | Error returns random UUID |
| BUG-009 | Medium | ✅ Fixed | Username case sensitivity |
| BUG-010 | Medium | ⏳ Pending | Migration marks complete on partial failure |
| BUG-011 | Medium | ⏳ Pending | Race condition on concurrent config access |
| BUG-012 | High | ✅ Fixed | UUID modal isCurrent flag broken |
| BUG-013 | High | ✅ Fixed | UUID setting uses unsaved DOM username |
| BUG-014 | Medium | ✅ Fixed | No way to switch between saved identities |
| BUG-015 | High | ✅ Fixed | installGame saves username (overwrites good value) |
| BUG-016 | High | ✅ Fixed | Username rename creates new UUID instead of preserving |
| BUG-017 | Medium | ✅ Fixed | UUID list not refreshing when player name changes |
| BUG-018 | Low | ✅ Fixed | Custom UUID input doesn't allow copy/paste |

---

## User Scenario Analysis

All user scenarios have been analyzed for UUID/username persistence:

| Scenario | Risk | Status | Details |
|----------|------|--------|---------|
| **Fresh Install** | Low | ✅ Safe | firstLaunch.js reads but doesn't modify username/UUID |
| **Username Change** | Low | ✅ Safe | Rename preserves UUID, user-initiated saves work correctly |
| **Auto-Update** | Low | ✅ Safe | Config is on disk before update, backup recovery available |
| **Manual Update** | Low | ✅ Safe | Config file persists across manual updates |
| **Different Install Location** | Low | ✅ Safe | Config uses central app directory, not install-relative |
| **Repair Game** | Low | ✅ Safe | repairGame() doesn't touch config |
| **UUID Modal** | Low | ✅ Fixed | Fixed isCurrent badge, unsaved username bug, added switch button |
| **Profile Switch** | Low | ✅ Safe | Profiles only control mods/java, not username/UUID |
| **Branch Change** | Low | ✅ Safe | Only changes game version, not identity |

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/core/config.js` | Atomic writes, backup/recovery, validation, case-insensitive UUID lookup, checkLaunchReady(), username rename preserves UUID |
| `backend/managers/gameLauncher.js` | Pre-launch validation, removed saveUsername call |
| `backend/managers/gameManager.js` | Removed saveUsername call from installGame |
| `backend/services/playerManager.js` | Marked DEPRECATED, throws on error, retry logic |
| `backend/launcher.js` | Export new functions (checkLaunchReady, hasUsername, etc.) |
| `GUI/js/launcher.js` | Uses checkLaunchReady API, blocks launch if no username |
| `GUI/js/settings.js` | UUID modal fixes, switchToUsername function, proper error handling, refreshes UUID list on name change |
| `GUI/style.css` | Switch button styling, user-select: text for UUID input |
| `GUI/locales/*.json` | Added translation keys for switch username functionality (all 10 locales) |
| `main.js` | Fixed UUID IPC handlers, added checkLaunchReady handler, enabled Ctrl+V/C/X/A shortcuts |
| `preload.js` | Exposed checkLaunchReady to renderer |

---

## Bug Categories

### Category A: Race Conditions & Initialization
### Category B: Silent Failures & Fallbacks
### Category C: Data Integrity & Persistence
### Category D: Design Issues
### Category E: UI/UX Issues

---

## Detailed Bug List & Fixes

---

### BUG-001: Username Not Loaded Before Play Click (CRITICAL) ✅ FIXED

**Category**: A - Race Condition

**Location**:
- `GUI/js/launcher.js`
- `GUI/js/settings.js`

**Problem**: If user clicks Play before settings DOM initializes, returns 'Player' silently.

**Fix Applied**:
- launcher.js now uses `checkLaunchReady()` API to validate before launch
- Loads username from backend config (single source of truth)
- Blocks launch and shows error if no username configured
- Navigates user to settings page to set username

---

### BUG-002: `isFirstLaunch()` Always Returns True (HIGH) ✅ FIXED

**Category**: B - Silent Failure

**Location**: `backend/core/config.js`

**Problem**: Function always returns `true` even when user has data (typo: `return true` instead of `return false`).

**Fix Applied**:
- Fixed return statement: `return true` → `return false`

---

### BUG-003: Silent Config Corruption Returns Empty Object (CRITICAL) ✅ FIXED

**Category**: B - Silent Failure

**Location**: `backend/core/config.js`

**Problem**: Corrupted config silently returns `{}`, causing UUID regeneration.

**Fix Applied**:
- Added config validation after load
- Implemented backup config system (config.json.bak)
- Tries loading backup if primary fails
- Logs detailed errors for debugging

---

### BUG-004: Non-Atomic Config Writes (CRITICAL) ✅ FIXED

**Category**: C - Data Integrity

**Location**: `backend/core/config.js`

**Problem**: Direct write can corrupt file if interrupted. Silent error logging.

**Fix Applied**:
- Atomic write: write to temp file → verify JSON → backup current → rename
- Throws error on save failure (no silent continuation)
- Cleans up temp file on failure

---

### BUG-005: Username Fallback to 'Player' (HIGH) ✅ FIXED

**Category**: B - Silent Failure

**Location**: `backend/core/config.js`

**Problem**: Missing username silently falls back to 'Player', causing wrong UUID.

**Fix Applied**:
- `loadUsername()` returns `null` instead of 'Player'
- Added `loadUsernameWithDefault()` for display purposes
- Added `hasUsername()` helper function
- All callers updated to handle null case explicitly

---

### BUG-006: Launch Overwrites Username Every Time (MEDIUM) ✅ FIXED

**Category**: D - Design Issue

**Location**: `backend/managers/gameLauncher.js`

**Problem**: If playerName parameter is wrong, it overwrites the saved username.

**Fix Applied**:
- Removed `saveUsername()` call from launch process
- Username only saved when user explicitly changes it in Settings
- Launch loads username from config (single source of truth)

---

### BUG-007: Dual UUID Systems (playerManager vs config) (MEDIUM) ✅ FIXED

**Category**: D - Design Issue

**Location**:
- `backend/services/playerManager.js` → `player_id.json`
- `backend/core/config.js` → `config.json` → `userUuids`

**Problem**: Two independent UUID systems can desync.

**Fix Applied**:
- `playerManager.js` marked as DEPRECATED
- All code uses `config.js` `getUuidForUser()`
- Migration function added for legacy `player_id.json`

---

### BUG-008: Error Returns Random UUID (HIGH) ✅ FIXED

**Category**: B - Silent Failure

**Location**: `backend/services/playerManager.js`

**Problem**: Any error generates random UUID, losing player identity.

**Fix Applied**:
- Now throws error instead of returning random UUID
- Retry logic added (3 attempts before failure)
- Caller must handle the error appropriately

---

### BUG-009: Username Case Sensitivity (MEDIUM) ✅ FIXED

**Category**: D - Design Issue

**Location**: `backend/core/config.js`

**Problem**: "PlayerOne" and "playerone" are different UUIDs.

**Fix Applied**:
- `getUuidForUser()` uses case-insensitive lookup
- Username stored with ORIGINAL case (preserves "Sanasol", "SaAnAsOl", etc.)
- Lookup normalized to lowercase for matching
- Case changes update the stored key while preserving UUID

---

### BUG-010: Migration Marks Complete Even on Partial Failure (MEDIUM) ⏳ PENDING

**Category**: C - Data Integrity

**Location**: `backend/utils/userDataMigration.js`

**Problem**: Partial copy is marked as complete, preventing retry.

**Status**: Not yet implemented - low priority since migration runs once.

---

### BUG-011: Race Condition on Concurrent Config Access (MEDIUM) ⏳ PENDING

**Category**: A - Race Condition

**Location**: `backend/core/config.js`

**Problem**: No file locking - concurrent processes can overwrite each other.

**Status**: Not yet implemented - would require `proper-lockfile` package. Low risk since launcher is single-instance.

---

### BUG-012: UUID Modal isCurrent Flag Broken (HIGH) ✅ FIXED

**Category**: D - Design Issue

**Location**: `main.js` - `get-all-uuid-mappings` IPC handler

**Problem**: Case-sensitive comparison between normalized key (lowercase) and current username.
```javascript
// BROKEN:
isCurrent: username === loadUsername()  // "player1" === "Player1" → FALSE
```

**Fix Applied**:
- IPC handler now uses `getAllUuidMappingsArray()` from config.js
- This function correctly compares against normalized username

---

### BUG-013: UUID Setting Uses Unsaved DOM Username (HIGH) ✅ FIXED

**Category**: B - Silent Failure

**Location**: `GUI/js/settings.js` - `performSetCustomUuid()`

**Problem**: Gets username from DOM input field instead of saved config.
```javascript
// BROKEN:
const username = getCurrentPlayerName();  // From UI input, not saved!
```

**Risk Scenario**: User types new name but doesn't save → opens UUID modal → sets custom UUID → UUID gets set for unsaved name while config has old name.

**Fix Applied**:
- Now loads username from backend config via `window.electronAPI.loadUsername()`
- Shows error if no username is saved

---

### BUG-014: No Way to Switch Between Saved Identities (MEDIUM) ✅ FIXED

**Category**: D - Design Issue

**Location**: `GUI/js/settings.js` - UUID modal

**Problem**: UUID modal showed list of usernames/UUIDs but no way to switch to a different identity.

**Fix Applied**:
- Added `switchToUsername()` function
- New switch button (user-check icon) on non-current entries
- Confirmation dialog before switching
- Updates username input and refreshes UUID display

---

### BUG-015: installGame Saves Username (HIGH) ✅ FIXED

**Category**: D - Design Issue

**Location**: `backend/managers/gameManager.js` - `installGame()`

**Problem**: `saveUsername(playerName)` call could overwrite good username with 'Player' default.

**Fix Applied**:
- Removed `saveUsername()` call from `installGame()`
- Username only saved when user explicitly changes it in Settings

---

### BUG-016: Username Rename Creates New UUID (HIGH) ✅ FIXED

**Category**: D - Design Issue

**Location**: `backend/core/config.js` - `saveUsername()`

**Problem**: When user changes their player name, a new UUID was generated instead of preserving the existing one. User's identity (cosmetics/skins) was lost on every name change.

**Symptom**: Change "Player1" to "NewPlayer" → gets completely new UUID → loses all cosmetics.

**Fix Applied**:
- `saveUsername()` now handles UUID mapping renames atomically
- When renaming: old username's UUID is moved to new username
- When switching to existing identity: uses that identity's existing UUID
- Case changes only: updates key casing, preserves UUID
- Both username and userUuids saved in single atomic operation

**Behavior After Fix**:
```javascript
// Rename: "Player1" → "NewPlayer"
// Before: Player1=uuid-123, NewPlayer=uuid-NEW (wrong!)
// After:  NewPlayer=uuid-123 (same UUID, just renamed)

// Switch to existing: "Player1" → "ExistingPlayer"
// Uses ExistingPlayer's existing UUID (switching identity)

// Case change: "Player1" → "PLAYER1"
// UUID preserved, key updated to new case
```

---

### BUG-017: UUID List Not Refreshing on Name Change (MEDIUM) ✅ FIXED

**Category**: E - UI/UX Issue

**Location**: `GUI/js/settings.js` - `savePlayerName()`

**Problem**: After changing player name in settings, the UUID modal list didn't refresh. The "Current" badge showed on the old username instead of the new one.

**Fix Applied**:
- Added `await loadAllUuids()` call after `loadCurrentUuid()` in `savePlayerName()`
- UUID modal now shows correct "Current" badge after name changes

---

### BUG-018: Custom UUID Input Doesn't Allow Copy/Paste (LOW) ✅ FIXED

**Category**: E - UI/UX Issue

**Location**: `GUI/style.css`, `main.js`

**Problem**: Two issues prevented copy/paste:
1. The body element has `select-none` class (Tailwind) which applies `user-select: none` globally
2. Electron's `setIgnoreMenuShortcuts(true)` was blocking Ctrl+V/C/X/A shortcuts

**Fix Applied**:
- Added `user-select: text` with all vendor prefixes to `.uuid-input` class
- Removed `setIgnoreMenuShortcuts(true)` from main.js
- Added early return in `before-input-event` handler to allow Ctrl/Cmd + V/C/X/A shortcuts
- DevTools shortcuts (Ctrl+Shift+I/J/C, F12) remain blocked

---

## Translation Keys Added

The following translation keys were added to `GUI/locales/en.json`:

```json
{
  "notifications": {
    "noUsername": "No username configured. Please save your username first.",
    "switchUsernameSuccess": "Switched to \"{username}\" successfully!",
    "switchUsernameFailed": "Failed to switch username",
    "playerNameTooLong": "Player name must be 16 characters or less"
  },
  "confirm": {
    "switchUsernameTitle": "Switch Identity",
    "switchUsernameMessage": "Switch to username \"{username}\"? This will change your current player identity.",
    "switchUsernameButton": "Switch"
  }
}
```

---

## Testing Checklist

After implementing fixes, verify:

- [x] Launch with freshly installed launcher - UUID persists
- [x] Change username in settings - UUID preserved (renamed, not new)
- [x] Config corruption - recovers from backup
- [x] Click Play immediately after opening - correct UUID used
- [x] Manual update from GitHub - UUID persists
- [x] Username with different casing - same UUID used, case preserved
- [x] UUID modal shows correct "Current" badge
- [x] UUID modal refreshes after username change
- [x] Switch identity from UUID modal works
- [x] Profile switching doesn't affect username/UUID
- [x] Custom UUID input allows copy/paste

---

## Architecture: How UUID/Username Persistence Works

**Config Structure** (`config.json`):
```json
{
  "username": "CurrentPlayer",
  "userUuids": {
    "Sanasol": "uuid-123-abc",
    "SaAnAsOl": "uuid-456-def",
    "Player1": "uuid-789-ghi"
  },
  "hasLaunchedBefore": true
}
```

**Key Design Decisions**:
- Username stored with ORIGINAL case (e.g., "Sanasol", "SaAnAsOl")
- UUID lookup is case-insensitive (normalized to lowercase for matching)
- Username rename preserves UUID (atomic rename operation)
- Profile switching does NOT affect username/UUID (shared globally)
- All config writes use atomic pattern: temp file → verify → backup → rename
- Automatic backup recovery if config corruption detected

**Data Flow**:
1. User sets username in Settings → `saveUsername()` handles rename logic → saves to config.json
2. If renaming: UUID moved from old name to new name (same UUID preserved)
3. Launch game → `checkLaunchReady()` validates username exists
4. Launch game → `getUuidForUser(username)` gets UUID (case-insensitive lookup)
5. UUID modal → shows all username→UUID mappings from config
6. Switch identity → saves new username → gets that username's UUID

---

## Success Criteria

- ✅ Zero silent UUID regeneration
- ✅ Config corruption recovery working
- ✅ No UUID change without explicit user action
- ✅ Username rename preserves UUID
- ✅ Username case is preserved in display
- ✅ UUID modal correctly identifies current user
- ✅ UUID modal refreshes on changes
- ✅ Users can switch between saved identities
- ✅ Copy/paste works in UUID input

---

## Remaining Work

1. **BUG-010**: Verify migration completeness before marking done (low priority)
2. **BUG-011**: Add file locking with `proper-lockfile` (low priority - single instance)
3. Add telemetry for config load failures and UUID regeneration events

## Completed Additional Tasks

- ✅ Added translation keys to all 10 locale files (de-DE, es-ES, fr-FR, id-ID, pl-PL, pt-BR, ru-RU, sv-SE, tr-TR, en)

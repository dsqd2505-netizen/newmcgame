# Testing Auto-Updates

This guide explains how to test the auto-update system during development.

## Quick Start

### Option 1: Test with GitHub Releases (Easiest)

1. **Set up dev-app-update.yml** (already done):
   ```yaml
   provider: github
   owner: amiayweb
   repo: Hytale-F2P
   ```

2. **Lower your current version** in `package.json`:
   - Change version to something lower than what's on GitHub (e.g., `2.0.1` if GitHub has `2.0.3`)

3. **Run the app in dev mode**:
   ```bash
   npm run dev
   # or
   npm start
   ```

4. **The app will check for updates** 3 seconds after startup
   - If a newer version exists on GitHub, it will detect it
   - Check the console logs for update messages

### Option 2: Test with Local HTTP Server

For more control, you can set up a local server:

1. **Create a test update server**:
   ```bash
   # Create a test directory
   mkdir -p test-updates
   cd test-updates
   ```

2. **Build a test version** with a higher version number:
   ```bash
   # In package.json, set version to 2.0.4
   npm run build
   ```

3. **Copy the generated files** to your test server:
   - Copy `dist/latest.yml` (or `latest-mac.yml` for macOS)
   - Copy the built installer/package

4. **Start a simple HTTP server**:
   ```bash
   # Using Python
   python3 -m http.server 8080
   
   # Or using Node.js http-server
   npx http-server -p 8080
   ```

5. **Update dev-app-update.yml** to point to local server:
   ```yaml
   provider: generic
   url: http://localhost:8080
   ```

6. **Run the app** and it will check your local server

## Testing Steps

### 1. Prepare Test Environment

**Current version**: `2.0.3` (in package.json)
**Test version**: `2.0.4` (on GitHub or local server)

### 2. Run the App

```bash
npm run dev
```

### 3. Watch for Update Events

The app will automatically check for updates 3 seconds after startup. Watch the console for:

```
Checking for updates...
Update available: 2.0.4
```

### 4. Check Console Logs

Look for these messages:
- `Checking for updates...` - Update check started
- `Update available: 2.0.4` - New version found
- `Download speed: ...` - Download progress
- `Update downloaded: 2.0.4` - Download complete

### 5. Test UI Integration

The app sends these events to the renderer:
- `update-checking`
- `update-available` (with version info)
- `update-download-progress` (with progress data)
- `update-downloaded` (ready to install)

You can listen to these in your frontend code to show update notifications.

## Manual Testing

### Trigger Manual Update Check

You can also trigger a manual check via IPC:
```javascript
// In renderer process
const result = await window.electronAPI.invoke('check-for-updates');
console.log(result);
```

### Install Update

After an update is downloaded:
```javascript
// In renderer process
await window.electronAPI.invoke('quit-and-install-update');
```

## Testing Scenarios

### Scenario 1: Update Available
1. Set `package.json` version to `2.0.1`
2. Ensure GitHub has version `2.0.3` or higher
3. Run app → Should detect update

### Scenario 2: Already Up to Date
1. Set `package.json` version to `2.0.3`
2. Ensure GitHub has version `2.0.3` or lower
3. Run app → Should show "no update available"

### Scenario 3: Prerelease Version
1. Set `package.json` version to `2.0.2b`
2. Ensure GitHub has version `2.0.3`
3. Run app → Should detect update (prerelease < release)

## Troubleshooting

### Update Not Detected

1. **Check dev-app-update.yml exists** in project root
2. **Verify dev mode is enabled** - Check console for "Dev update mode enabled"
3. **Check version numbers** - Remote version must be higher than current
4. **Check network** - App needs internet to reach GitHub/local server
5. **Check logs** - Look for error messages in console

### Common Errors

- **"Cannot find module 'electron-updater'"**: Run `npm install`
- **"Update check failed"**: Check network connection or GitHub API access
- **"No update available"**: Version comparison issue - check versions

### Debug Mode

Enable more verbose logging by checking the console output. The logger will show:
- Update check requests
- Version comparisons
- Download progress
- Any errors

## Testing with Real GitHub Releases

For the most realistic test:

1. **Create a test release on GitHub**:
   - Build the app with version `2.0.4`
   - Create a GitHub release with tag `v2.0.4`
   - Upload the built files

2. **Lower your local version**:
   - Set `package.json` to `2.0.3`

3. **Run the app**:
   - It will check GitHub and find `2.0.4`
   - Download and install the update

## Notes

- **Dev mode only works when app is NOT packaged** (`!app.isPackaged`)
- **Production builds** ignore `dev-app-update.yml` and use the built-in `app-update.yml`
- **macOS**: Code signing is required for updates to work in production
- **Windows**: NSIS installer is required for auto-updates

## Next Steps

Once testing is complete:
1. Remove or comment out `forceDevUpdateConfig` for production
2. Ensure proper code signing for macOS
3. Set up CI/CD to automatically publish releases

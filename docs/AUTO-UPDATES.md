# Auto-Updates System

This document explains how the automatic update system works in the Hytale F2P Launcher.

## Overview

The launcher uses [electron-updater](https://www.electron.build/auto-update) to automatically check for, download, and install updates. When a new version is available, users are notified and the update is downloaded in the background.

## How It Works

### 1. Update Checking

- **Automatic Check**: The app automatically checks for updates 3 seconds after startup
- **Manual Check**: Users can manually check for updates through the UI
- **Update Source**: Updates are fetched from GitHub Releases

### 2. Update Process

1. **Check for Updates**: The app queries GitHub Releases for a newer version
2. **Notify User**: If an update is available, the user is notified via the UI
3. **Download**: The update is automatically downloaded in the background
4. **Progress Tracking**: Download progress is shown to the user
5. **Install**: When the download completes, the user can choose to install immediately or wait until the app restarts

### 3. Installation

- Updates are installed when the app quits (if `autoInstallOnAppQuit` is enabled)
- Users can also manually trigger installation through the UI
- The app will restart automatically after installation

## Version Detection & Comparison

### Current Version Source

The app's current version is read from `package.json`:

```json
{
  "version": "2.0.2b"
}
```

This version is embedded into the built application and is accessible via `app.getVersion()` in Electron. When the app is built, electron-builder also creates an internal `app-update.yml` file in the app's resources that contains this version information.

### How Version Detection Works

1. **Current Version**: The app knows its own version from `package.json`, which is:
   - Read at build time
   - Embedded in the application binary
   - Stored in the app's metadata

2. **Fetching Latest Version**: When checking for updates, electron-updater:
   - Queries the GitHub Releases API: `https://api.github.com/repos/amiayweb/Hytale-F2P/releases/latest`
   - Or reads the update metadata file: `https://github.com/amiayweb/Hytale-F2P/releases/download/latest/latest.yml` (or `latest-mac.yml` for macOS)
   - The metadata file contains:
     ```yaml
     version: 2.0.3
     releaseDate: '2024-01-15T10:30:00.000Z'
     path: Hytale-F2P-Launcher-2.0.3-x64.exe
     sha512: ...
     ```

3. **Version Comparison**: electron-updater uses semantic versioning comparison:
   - Compares the **current version** (from `package.json`) with the **latest version** (from GitHub Releases)
   - Uses semantic versioning rules: `major.minor.patch` (e.g., `2.0.2` vs `2.0.3`)
   - An update is available if the remote version is **greater than** the current version
   - Examples:
     - Current: `2.0.2` → Remote: `2.0.3` ✅ Update available
     - Current: `2.0.2` → Remote: `2.0.2` ❌ No update (same version)
     - Current: `2.0.3` → Remote: `2.0.2` ❌ No update (current is newer)
     - Current: `2.0.2b` → Remote: `2.0.3` ✅ Update available (prerelease tags are handled)

4. **Version Format Handling**:
   - **Semantic versions** (e.g., `1.0.0`, `2.1.3`) are compared numerically
   - **Prerelease versions** (e.g., `2.0.2b`, `2.0.2-beta`) are compared with special handling
   - **Non-semantic versions** may cause issues - it's recommended to use semantic versioning

### Update Metadata Files

When you build and publish a release, electron-builder generates platform-specific metadata files:

**Windows/Linux** (`latest.yml`):
```yaml
version: 2.0.3
files:
  - url: Hytale-F2P-Launcher-2.0.3-x64.exe
    sha512: abc123...
    size: 12345678
path: Hytale-F2P-Launcher-2.0.3-x64.exe
sha512: abc123...
releaseDate: '2024-01-15T10:30:00.000Z'
```

**macOS** (`latest-mac.yml`):
```yaml
version: 2.0.3
files:
  - url: Hytale-F2P-Launcher-2.0.3-arm64-mac.zip
    sha512: def456...
    size: 23456789
path: Hytale-F2P-Launcher-2.0.3-arm64-mac.zip
sha512: def456...
releaseDate: '2024-01-15T10:30:00.000Z'
```

These files are:
- Automatically generated during build
- Uploaded to GitHub Releases
- Fetched by electron-updater to check for updates
- Used to determine if an update is available and what to download

### The Check Process in Detail

When `appUpdater.checkForUpdatesAndNotify()` is called:

1. **Read Current Version**: Gets version from `app.getVersion()` (which reads from `package.json`)
2. **Fetch Update Info**: 
   - Makes HTTP request to GitHub Releases API or reads `latest.yml`
   - Gets the version number from the metadata
3. **Compare Versions**: 
   - Uses semantic versioning comparison (e.g., `semver.gt(remoteVersion, currentVersion)`)
   - If remote > current: update available
   - If remote <= current: no update
4. **Emit Events**: 
   - `update-available` if newer version found
   - `update-not-available` if already up to date
5. **Download if Available**: If `autoDownload` is enabled, starts downloading automatically

### Example Flow

```
App Version: 2.0.2 (from package.json)
                ↓
Check GitHub Releases API
                ↓
Latest Release: 2.0.3
                ↓
Compare: 2.0.3 > 2.0.2? YES
                ↓
Emit: 'update-available' event
                ↓
Download update automatically
                ↓
Emit: 'update-downloaded' event
                ↓
User can install on next restart
```

## Components

### AppUpdater Class (`backend/appUpdater.js`)

The main class that handles all update operations:

- **`checkForUpdatesAndNotify()`**: Checks for updates and shows a system notification if available
- **`checkForUpdates()`**: Manually checks for updates (returns a promise)
- **`quitAndInstall()`**: Quits the app and installs the downloaded update

### Events

The AppUpdater emits the following events that the UI can listen to:

- `update-checking`: Update check has started
- `update-available`: A new update is available
- `update-not-available`: App is up to date
- `update-download-progress`: Download progress updates
- `update-downloaded`: Update has finished downloading
- `update-error`: An error occurred during the update process

## Configuration

### Package.json

The publish configuration in `package.json` tells electron-builder where to publish updates:

```json
"publish": {
  "provider": "github",
  "owner": "amiayweb",
  "repo": "Hytale-F2P"
}
```

This means updates will be fetched from GitHub Releases for the `amiayweb/Hytale-F2P` repository.

## Publishing Updates

### For Developers

1. **Update Version**: Bump the version in `package.json` (e.g., `2.0.2b` → `2.0.3`)

2. **Build the App**: Run the build command for your platform:
   ```bash
   npm run build:win    # Windows
   npm run build:mac    # macOS
   npm run build:linux  # Linux
   ```

3. **Publish to GitHub**: When building with electron-builder, it will:
   - Generate update metadata files (`latest.yml`, `latest-mac.yml`, etc.)
   - Upload the built files to GitHub Releases (if configured with `GH_TOKEN`)
   - Make them available for auto-update

4. **Release on GitHub**: Create a GitHub Release with the new version tag

### Important Notes

- **macOS Code Signing**: macOS apps **must** be code-signed for auto-updates to work
- **Version Format**: Use semantic versioning (e.g., `1.0.0`, `2.0.1`) for best compatibility
- **Update Files**: electron-builder automatically generates the required metadata files (`latest.yml`, etc.)

## Testing Updates

### Development Mode

To test updates during development, create a `dev-app-update.yml` file in the project root:

```yaml
owner: amiayweb
repo: Hytale-F2P
provider: github
```

Then enable dev mode in the code:
```javascript
autoUpdater.forceDevUpdateConfig = true;
```

### Local Testing

For local testing, you can use a local server (like Minio) or a generic HTTP server to host update files.

## User Experience

### What Users See

1. **On Startup**: The app silently checks for updates in the background
2. **Update Available**: A notification appears if an update is found
3. **Downloading**: Progress bar shows download status
4. **Ready to Install**: User is notified when the update is ready
5. **Installation**: Update installs on app restart or when user clicks "Install Now"

### User Actions

- Users can manually check for updates through the settings/update menu
- Users can choose to install immediately or wait until next app launch
- Users can continue using the app while updates download in the background

## Troubleshooting

### Updates Not Working

1. **Check GitHub Releases**: Ensure releases are published on GitHub
2. **Check Version**: Make sure the version in `package.json` is higher than the current release
3. **Check Logs**: Check the app logs for update-related errors
4. **Code Signing (macOS)**: Verify the app is properly code-signed

### Common Issues

- **"Update not available"**: Version in `package.json` may not be higher than the current release
- **"Download failed"**: Network issues or GitHub API rate limits
- **"Installation failed"**: Permissions issue or app is running from an unsupported location

## Technical Details

### Supported Platforms

- **Windows**: NSIS installer (auto-update supported)
- **macOS**: DMG + ZIP (auto-update supported, requires code signing)
- **Linux**: AppImage, DEB, RPM, Pacman (auto-update supported)

### Update Files Generated

When building, electron-builder generates:
- `latest.yml` (Windows/Linux)
- `latest-mac.yml` (macOS)
- `latest-linux.yml` (Linux)

These files contain metadata about the latest release and are automatically uploaded to GitHub Releases.

## References

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [electron-builder Auto Update Guide](https://www.electron.build/auto-update)

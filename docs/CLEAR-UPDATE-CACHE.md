# Clearing Electron-Updater Cache

To force electron-updater to re-download an update file, you need to clear the cached download.

## Quick Method (Terminal)

### macOS
```bash
# Remove the entire cache directory
rm -rf ~/Library/Caches/hytale-f2p-launcher

# Or just remove pending downloads
rm -rf ~/Library/Caches/hytale-f2p-launcher/pending
```

### Windows
```bash
# Remove the entire cache directory
rmdir /s "%LOCALAPPDATA%\hytale-f2p-launcher-updater"

# Or just remove pending downloads
rmdir /s "%LOCALAPPDATA%\hytale-f2p-launcher-updater\pending"
```

### Linux
```bash
# Remove the entire cache directory
rm -rf ~/.cache/hytale-f2p-launcher-updater

# Or just remove pending downloads
rm -rf ~/.cache/hytale-f2p-launcher-updater/pending
```

## Cache Locations

electron-updater stores downloaded updates in:

- **macOS**: `~/Library/Caches/hytale-f2p-launcher/`
- **Windows**: `%LOCALAPPDATA%\hytale-f2p-launcher-updater\`
- **Linux**: `~/.cache/hytale-f2p-launcher-updater/`

The cache typically contains:
- `pending/` - Downloaded update files waiting to be installed
- Metadata files about available updates

## After Clearing

After clearing the cache:
1. Restart the launcher
2. It will check for updates again
3. The update will be re-downloaded from scratch

## Programmatic Method

You can also clear the cache programmatically by adding this to your code:

```javascript
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

function clearUpdateCache() {
  const cacheDir = path.join(
    os.homedir(),
    process.platform === 'win32' 
      ? 'AppData/Local/hytale-f2p-launcher-updater'
      : process.platform === 'darwin'
      ? 'Library/Caches/hytale-f2p-launcher'
      : '.cache/hytale-f2p-launcher-updater'
  );
  
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('Update cache cleared');
  }
}
```

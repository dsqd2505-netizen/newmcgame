# Hytale F2P Launcher - Troubleshooting Guide

This guide covers common issues and their solutions. If your issue isn't listed here, please check [existing issues](https://github.com/amiayweb/Hytale-F2P/issues) or join our [Discord](https://discord.gg/gME8rUy3MB).

---

## Table of Contents

- [Windows Issues](#windows-issues)
- [Linux Issues](#linux-issues)
- [macOS Issues](#macos-issues)
- [Connection & Server Issues](#connection--server-issues)
- [Authentication & Token Issues](#authentication--token-issues)
- [Avatar & Cosmetics Issues](#avatar--cosmetics-issues)
- [General Issues](#general-issues)
- [Known Limitations](#known-limitations)

---

## Windows Issues

### "Failed to connect to server" / Server won't boot

**Symptoms:** Singleplayer world fails to load, "Server failed to boot" error.

**Solution - Whitelist in Windows Firewall:**
1. Open **Windows Settings** > **Privacy & Security** > **Windows Security**
2. Click **Firewall & network protection** > **Allow an app through firewall**
3. Click **Change settings**
4. Find `HytaleClient.exe` and check both **Private** and **Public**
5. If not listed, click **Allow another app** and browse to:
   ```
   %localappdata%\HytaleF2P\release\package\game\latest\Client\HytaleClient.exe
   ```

### Duplicate mod error

**Symptoms:** `java.lang.IllegalArgumentException: Tried to load duplicate plugin`

**Solution:**
1. Navigate to your mods folder:
   ```
   %localappdata%\HytaleF2P\release\package\game\latest\Client\UserData\Mods
   ```
2. Remove any duplicate `.jar` files
3. Restart the launcher

### SmartScreen blocks the launcher

**Solution:**
1. Click **More info**
2. Click **Run anyway**

---

## Linux Issues

### GPU not detected / Using software rendering (llvmpipe)

**Symptoms:**
- Game uses integrated GPU instead of dedicated GPU
- Very low FPS / unplayable performance
- Play button not clickable
- Log shows `llvmpipe` instead of your GPU

**Solution for NVIDIA:**
```bash
__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json ./HytaleF2P.AppImage
```

**Solution for AMD (hybrid GPU systems):**
```bash
DRI_PRIME=1 ./HytaleF2P.AppImage
```

**Permanent fix - Create a launcher script:**
```bash
#!/bin/bash
export __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json
export DRI_PRIME=1
./HytaleF2P.AppImage
```

**Note:** On some desktop systems with AMD iGPU + dGPU, the GPU selector may be inverted (selecting iGPU actually uses dGPU). Use whichever option works.

### SDL3_image / libpng errors

**Symptoms:**
- `DllNotFoundException: Unable to load shared library 'SDL3_image'`
- `libpng` related errors
- Game crashes on startup

**Solution - Install dependencies:**

**Fedora / RHEL:**
```bash
sudo dnf install libpng libpng-devel
```

**Debian / Ubuntu:**
```bash
sudo apt install libpng16-16 libpng-dev libgdiplus libc6-dev
```

**Arch Linux:**
```bash
sudo pacman -S libpng
```

**Alternative - Replace corrupted library:**
```bash
cd ~/.hytalef2p/release/package/game/latest/Client/
mv libSDL3_image.so libSDL3_image.so.bak
wget https://github.com/user-attachments/files/24710966/libSDL3_image.zip
unzip libSDL3_image.zip
chmod 644 libSDL3_image.so
rm libSDL3_image.zip
```

### AppImage won't launch / FUSE error

**Solution:**
```bash
# Debian/Ubuntu
sudo apt install libfuse2

# Fedora
sudo dnf install fuse

# Arch
sudo pacman -S fuse2
```

### Missing libxcrypt.so.1

**Solution:**
```bash
# Fedora/RHEL
sudo dnf install libxcrypt-compat

# Arch
sudo pacman -S libxcrypt-compat
```

### Wayland display issues

**Symptoms:** Game doesn't launch, stuck at loading, or display glitches on Wayland.

**Solution - Force X11:**
```bash
GDK_BACKEND=x11 ./HytaleF2P.AppImage
```

**Alternative - Electron Wayland hint:**
```bash
ELECTRON_OZONE_PLATFORM_HINT=auto ./HytaleF2P.AppImage
```

### Steam Deck / Gamescope issues

**Solution 1 - Add custom launch options in Steam:**
```
ELECTRON_OZONE_PLATFORM_HINT=x11 %command%
```

**Solution 2 - Launch from Desktop Mode** instead of Game Mode.

**Solution 3 - Force X11:**
```bash
GDK_BACKEND=x11 ./HytaleF2P.AppImage
```

### Ubuntu LTS-based distros (Linux Mint, Zorin OS, Pop!_OS)

These distributions may have compatibility issues due to older system packages. This is a limitation of the Hytale game client, not the launcher.

**Workarounds:**
1. Install all dependencies listed above
2. Try the SDL3_image replacement
3. Consider using a more recent distribution or Flatpak/AppImage with bundled dependencies

---

## macOS Issues

### "Butler system error -86" (Apple Silicon)

**Symptoms:** `Butler execution failed: spawn Unknown system error -86` (EXC_BAD_CPU_TYPE)

**Cause:** Butler (the update tool) is x86_64 only.

**Solution - Install Rosetta 2:**
```bash
softwareupdate --install-rosetta
```

Then restart the launcher.

### Auto-update fails with code signature error

**Symptoms:**
```
Code signature at URL did not pass validation
domain: 'SQRLCodeSignatureErrorDomain'
```

**Solution - Manual update:**
1. Download the latest version manually from [Releases](https://github.com/amiayweb/Hytale-F2P/releases/latest)
2. Backup your data first (see [Backup Locations](#backup-locations))
3. Install the fresh download

### "Unidentified developer" warning

**Solution:**
1. Open **System Settings** > **Privacy & Security**
2. Scroll to **Security** section
3. Find the message about "Hytale F2P Launcher"
4. Click **Open Anyway**
5. Authenticate and click **Open**

### App won't open (quarantine)

**Solution:**
```bash
xattr -rd com.apple.quarantine /Applications/Hytale-F2P-Launcher.app
```

---

## Connection & Server Issues

### "Failed to connect to server" in Singleplayer

**Possible causes:**
1. Windows Firewall blocking (see [Windows section](#failed-to-connect-to-server--server-wont-boot))
2. Patched server JAR download failed
3. Regional network restrictions

**Solution - Check patched JAR:**
1. Look for `HytaleServer.jar` in:
   - Windows: `%localappdata%\HytaleF2P\release\package\game\latest\Server\`
   - Linux: `~/.hytalef2p/release/package/game/latest/Server/`
   - macOS: `~/Library/Application Support/HytaleF2P/release/package/game/latest/Server/`
2. If missing or very small, the download may have failed

**Solution - Regional restrictions:**

Some countries (Russia, Turkey, Indonesia, etc.) may have issues accessing download servers.
- Try using a VPN for the initial download
- Once downloaded, the patched JAR is cached locally

### "Infinite Booting Server" / Server stuck loading

**Solution:**
1. Check if the patched JAR downloaded successfully (see above)
2. Ensure your GPU meets minimum requirements
3. Check launcher logs for specific errors
4. Try with a VPN if in a restricted region

### "Connection timed out from inactivity"

**This is expected behavior.** Sessions have a 10-hour TTL and will timeout after extended inactivity. Simply reconnect to continue playing.

---

## Authentication & Token Issues

### "Invalid identity token" / "Failed to start Hytale"

**Solution:**
1. **Restart the launcher** - This fetches fresh tokens
2. **Check system time** - JWT validation requires accurate system time
3. **Clear cached tokens:**
   - Delete `config.json` from your HytaleF2P folder
   - Restart the launcher
   - Re-enter your username

**Locations:**
- Windows: `%localappdata%\HytaleF2P\config.json`
- Linux: `~/.hytalef2p/config.json`
- macOS: `~/Library/Application Support/HytaleF2P/config.json`

### Token refresh errors

If you see issuer mismatch errors in logs:
1. Delete `config.json` and `player_id.json`
2. Restart the launcher
3. This forces a fresh authentication

---

## Avatar & Cosmetics Issues

### Avatar/skin changes not saving

**This is a known F2P limitation:**
- F2P mode has no password protection for usernames
- Anyone can use any username
- Cosmetics are stored server-side by username
- If someone else uses your username, they can change your cosmetics

**Workaround:** Use a unique username that others are unlikely to choose.

### Character invisible / Customization crashes

**Solution:**
1. Use **Repair Game** in launcher Settings
2. Verify `Assets.zip` exists in your game folder
3. Clear cached assets:
   - Windows: Delete `%localappdata%\HytaleF2P\release\package\game\latest\Client\UserData\CachedAssets\`
4. Restart the launcher

### Avatar creator shows "Offline Mode"

**Cause:** Cannot connect to auth server.

**Solution:**
1. Check your internet connection
2. Test connectivity: Open `https://auth.sanasol.ws/health` in browser (should show "OK")
3. Check if firewall is blocking the connection
4. Try disabling VPN (or enabling one if in restricted region)

---

## General Issues

### Mods not showing up

**Solution:**
1. Ensure mods are placed in the correct folder:
   - Windows: `%localappdata%\HytaleF2P\release\package\game\latest\Client\UserData\Mods\`
   - Linux: `~/.hytalef2p/release/package/game/latest/Client/UserData/Mods/`
   - macOS: `~/Library/Application Support/HytaleF2P/release/package/game/latest/Client/UserData/Mods/`
2. Verify mod files are `.jar` format
3. Check launcher logs for mod loading errors

### Game updates delete configurations/mods

**This is a known issue being worked on.**

**Prevention - Always backup before updating:**
- Server configs and worlds
- Mods folder
- `config.json` and `player_id.json`

See [Backup Locations](#backup-locations) below.

### Play button not clickable

Usually caused by GPU detection failure. See [GPU not detected](#gpu-not-detected--using-software-rendering-llvmpipe).

**Alternative:**
1. Go to **Settings** > **Graphics**
2. Manually select your GPU
3. Restart the launcher

### Read timeout errors

**Cause:** Network connectivity issues.

**Solutions:**
1. Check your internet connection stability
2. Try using a VPN
3. Check firewall settings
4. Try at a different time (server load varies)

---

## Known Limitations

### Linux ARM64 not supported

Hytale does not provide ARM64 game client builds. The launcher downloads from official Hytale servers which only provide:
- Windows x64
- macOS (Universal/Intel)
- Linux x64

This is outside our control.

### F2P Username System

- No password protection for usernames
- Anyone can claim any username
- Cosmetics shared by username
- UUIDs generated based on username

A per-player password system is planned for future versions.

### Session Timeout

Game sessions have a 10-hour TTL. This is by design for security.

---

## Backup Locations

### Windows
```
%localappdata%\HytaleF2P\
├── config.json                    # Launcher settings
├── player_id.json                 # Player identity
└── release\package\game\latest\
    ├── Client\UserData\           # Saves, settings, mods
    └── Server\
        ├── universe\              # World data
        └── config.json            # Server config
```

### Linux
```
~/.hytalef2p/
├── config.json
├── player_id.json
└── release/package/game/latest/
    ├── Client/UserData/
    └── Server/
        ├── universe/
        └── config.json
```

### macOS
```
~/Library/Application Support/HytaleF2P/
├── config.json
├── player_id.json
└── release/package/game/latest/
    ├── Client/UserData/
    └── Server/
        ├── universe/
        └── config.json
```

---

## Getting Help

If your issue isn't resolved by this guide:

1. **Check existing issues:** [GitHub Issues](https://github.com/amiayweb/Hytale-F2P/issues)
2. **Join Discord:** [discord.gg/gME8rUy3MB](https://discord.gg/gME8rUy3MB)
3. **Open a new issue** with:
   - Your operating system and version
   - Launcher version
   - Full launcher logs from:
     - Windows: `%localappdata%\HytaleF2P\logs\`
     - Linux: `~/.hytalef2p/logs/`
     - macOS: `~/Library/Application Support/HytaleF2P/logs/`
   - Steps to reproduce the issue

---

## Logs Location

For bug reports, please include logs from:

| OS | Path |
|----|------|
| Windows | `%localappdata%\HytaleF2P\logs\` |
| Linux | `~/.hytalef2p/logs/` |
| macOS | `~/Library/Application Support/HytaleF2P/logs/` |

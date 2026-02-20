const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

function getOS() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}

function getArch() {
  return process.arch === 'x64' ? 'amd64' : process.arch;
}

function isWaylandSession() {
  if (process.platform !== 'linux') {
    return false;
  }
  
  const sessionType = process.env.XDG_SESSION_TYPE;
  const waylandDisplay = process.env.WAYLAND_DISPLAY;

  // Debug logging
  console.log(`[PlatformUtils] Checking Wayland: XDG_SESSION_TYPE=${sessionType}, WAYLAND_DISPLAY=${waylandDisplay}`);

  if (sessionType && sessionType.toLowerCase() === 'wayland') {
    return true;
  }
  
  if (waylandDisplay) {
    return true;
  }
  
  try {
    const sessionId = process.env.XDG_SESSION_ID;
    if (sessionId) {
      const output = execSync(`loginctl show-session ${sessionId} -p Type`, { encoding: 'utf8' });
      if (output && output.toLowerCase().includes('wayland')) {
        return true;
      }
    }
  } catch (err) {
  }
  
  return false;
}

function setupWaylandEnvironment() {
  if (process.platform !== 'linux') {
    return {};
  }

  // If the user has manually set SDL_VIDEODRIVER (e.g. to 'x11'), strictly respect it.
  if (process.env.SDL_VIDEODRIVER) {
    console.log(`User manually set SDL_VIDEODRIVER=${process.env.SDL_VIDEODRIVER}, ignoring internal Wayland configuration.`);
    return {};
  }
  
  if (!isWaylandSession()) {
    console.log('Detected X11 session, using default environment');
    return {};
  }
  
  console.log('Detected Wayland session, checking for Gamescope/Steam Deck...');
  
  const envVars = {};

  // Only set Ozone hint if not already set by user
  if (!process.env.ELECTRON_OZONE_PLATFORM_HINT) {
    envVars.ELECTRON_OZONE_PLATFORM_HINT = 'wayland';
  }

  // 2. DETECT GAMESCOPE / STEAM DECK
  // Native Wayland often fails for SDL games in Gaming Mode (gamescope), so we force X11 (XWayland).
  // Checks:
  // - XDG_CURRENT_DESKTOP == 'gamescope'
  // - SteamDeck=1 (often set in SteamOS)
  const currentDesktop = process.env.XDG_CURRENT_DESKTOP || '';
  const isGamescope = currentDesktop.toLowerCase() === 'gamescope' || process.env.SteamDeck === '1';
  
  if (isGamescope) {
    console.log('Gamescope / Steam Deck detected, forcing SDL_VIDEODRIVER=x11 for compatibility');
    envVars.SDL_VIDEODRIVER = 'x11';
  } else {
    // For standard desktop Wayland (GNOME, KDE), we leave SDL_VIDEODRIVER unset.
    // This allows SDL3/SDL2 to use its internal preference (Wayland > X11).
    // EXCEPT if it was somehow force-set to 'wayland' by the parent process (rare but possible),
    // we strictly want to allow fallback, so we might unset it if it was 'wayland'.
    // But since we checked process.env.SDL_VIDEODRIVER at the start, we know it's NOT set manually.
    
    // So we effectively do nothing for standard Wayland, letting SDL decide.
    console.log('Standard Wayland session detected, letting SDL decide backend (auto-fallback enabled).');
  }
  
  console.log('Wayland environment variables:', envVars);
  return envVars;
}

function detectGpu() {
  const platform = getOS();

  try {
    if (platform === 'linux') {
      return detectGpuLinux();
    } else if (platform === 'windows') {
      return detectGpuWindows();
    } else if (platform === 'darwin') {
      return detectGpuMac();
    } else {
      return { mode: 'integrated', vendor: 'intel', integratedName: 'Unknown', dedicatedName: null };
    }
  } catch (error) {
    console.warn('GPU detection failed, falling back to integrated:', error.message);
    return { mode: 'integrated', vendor: 'intel', integratedName: 'Unknown', dedicatedName: null };
  }
}

function detectGpuLinux() {
  let output = '';
  try {
    output = execSync('lspci -nn | grep -E "VGA|3D"', { encoding: 'utf8' });
  } catch (e) {
    return { mode: 'integrated', vendor: 'intel', integratedName: 'Unknown', dedicatedName: null };
  }

  const lines = output.split('\n').filter(line => line.trim());

  let gpus = {
    integrated: [],
    dedicated: []
  };

  for (const line of lines) {
    // Example: 01:00.0 VGA compatible controller [0300]: NVIDIA Corporation TU116 [GeForce GTX 1660 Ti] [10de:2182] (rev a1)
    
    // Matches all content inside [...]
    const brackets = line.match(/\[([^\]]+)\]/g);
    
    let name = line; // fallback
    let vendorId = '';
    
    if (brackets && brackets.length >= 2) {
      const idBracket = brackets.find(b => b.includes(':')); // [10de:2182]
      if (idBracket) {
        vendorId = idBracket.replace(/[\[\]]/g, '').split(':')[0].toLowerCase();
        
        // The bracket before the ID bracket is usually the model name.
        const idIndex = brackets.indexOf(idBracket);
        if (idIndex > 0) {
          name = brackets[idIndex - 1].replace(/[\[\]]/g, '');
        }
      }
    } else if (brackets && brackets.length === 1) {
        name = brackets[0].replace(/[\[\]]/g, '');
    }

    // Clean name
    name = name.trim();
    const lowerName = name.toLowerCase();
    const lowerLine = line.toLowerCase();

    // Vendor detection
    const isNvidia = lowerLine.includes('nvidia') || vendorId === '10de';
    const isAmd = lowerLine.includes('amd') || lowerLine.includes('radeon') || vendorId === '1002';
    const isIntel = lowerLine.includes('intel') || vendorId === '8086';
    
    // Intel Arc detection
    const isIntelArc = isIntel && (lowerName.includes('arc') || lowerName.includes('a770') || lowerName.includes('a750') || lowerName.includes('a380'));

    let vendor = 'unknown';
    if (isNvidia) vendor = 'nvidia';
    else if (isAmd) vendor = 'amd';
    else if (isIntel) vendor = 'intel';

    let vramMb = 0;

    // VRAM Detection Logic
    if (isNvidia) {
      try {
        // Try nvidia-smi
        const smiOutput = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const vramVal = parseInt(smiOutput.split('\n')[0]); // Take first if multiple
        if (!isNaN(vramVal)) {
          vramMb = vramVal;
        }
      } catch (err) {
        // failed
      }
    } else if (isAmd) {
      // Try /sys/class/drm/card*/device/mem_info_vram_total
      // This is a bit heuristical, we need to match the card.
      // But usually checking any card with AMD vendor in /sys is a good guess if we just want "the AMD GPU vram".
      try {
        const cards = fs.readdirSync('/sys/class/drm').filter(c => c.startsWith('card') && !c.includes('-'));
        for (const card of cards) {
           try {
             const vendorFile = fs.readFileSync(`/sys/class/drm/${card}/device/vendor`, 'utf8').trim();
             if (vendorFile === '0x1002') { // AMD vendor ID
               const vramBytes = fs.readFileSync(`/sys/class/drm/${card}/device/mem_info_vram_total`, 'utf8').trim();
               vramMb = Math.round(parseInt(vramBytes) / (1024 * 1024));
               if (vramMb > 0) break; 
             }
           } catch (e2) {}
        }
      } catch (err) {}
    } else if (isIntel) {
       // Try lspci -v to get prefetchable memory (stolen/dedicated aperture)
       try {
         // Extract slot from line, e.g. "00:02.0"
         const slot = line.split(' ')[0];
         if (slot && /^[0-9a-f:.]+$/.test(slot)) {
            const verbose = execSync(`lspci -v -s ${slot}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const vLines = verbose.split('\n');
            for (const vLine of vLines) {
                // Match "Memory at ... (..., prefetchable) [size=256M]"
                // Must ensure it is prefetchable and NOT non-prefetchable
                if (vLine.includes('prefetchable') && !vLine.includes('non-prefetchable')) {
                    const match = vLine.match(/size=([0-9]+)([KMGT])/);
                    if (match) {
                        let size = parseInt(match[1]);
                        const unit = match[2];
                        if (unit === 'G') size *= 1024;
                        else if (unit === 'K') size /= 1024;
                        // M is default
                        if (size > 0) {
                            vramMb = size;
                            break;
                        }
                    }
                }
            }
         }
       } catch (e) {
         // ignore
       }
    }

    const gpuInfo = {
      name: name,
      vendor: vendor,
      vram: vramMb
    };

    if (isNvidia || isAmd || isIntelArc) {
      gpus.dedicated.push(gpuInfo);
    } else if (isIntel) {
      gpus.integrated.push(gpuInfo);
    } else {
      // Unknown vendor or other, fallback to integrated list to be safe
      gpus.integrated.push(gpuInfo);
    }
  }

  // Fallback: Attempt to get Integrated VRAM via glxinfo if it's STILL 0 (common for Intel iGPUs if lspci failed)
  // glxinfo -B usually reports the active renderer's "Video memory" which includes shared memory for iGPUs.
  if (gpus.integrated.length > 0 && gpus.integrated[0].vram === 0) {
    try {
      const glxOut = execSync('glxinfo -B', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = glxOut.split('\n');
      let glxVendor = '';
      let glxMem = 0;
      
      for (const line of lines) {
        const trim = line.trim();
        if (trim.startsWith('Device:')) {
            const lower = trim.toLowerCase();
            if (lower.includes('intel')) glxVendor = 'intel';
            else if (lower.includes('nvidia')) glxVendor = 'nvidia';
            else if (lower.includes('amd') || lower.includes('ati')) glxVendor = 'amd';
        } else if (trim.startsWith('Video memory:')) {
            // Example: "Video memory: 15861MB"
            const memStr = trim.split(':')[1].replace('MB', '').trim();
            glxMem = parseInt(memStr, 10); 
        }
      }
      
      // If glxinfo reports Intel and we have an Intel integrated GPU, update it
      // We check vendor match to ensure we don't accidentally assign Nvidia VRAM to Intel if user is running on dGPU
      if (glxVendor === 'intel' && gpus.integrated[0].vendor === 'intel' && glxMem > 0) {
          gpus.integrated[0].vram = glxMem;
      }
    } catch (err) {
      // glxinfo missing or failed, ignore
    }
  }

  const primaryDedicated = gpus.dedicated[0] || null;
  const primaryIntegrated = gpus.integrated[0] || { name: 'Intel GPU', vram: 0 };
  
  return {
    mode: primaryDedicated ? 'dedicated' : 'integrated',
    vendor: primaryDedicated ? primaryDedicated.vendor : (gpus.integrated[0] ? gpus.integrated[0].vendor : 'intel'),
    integratedName: primaryIntegrated.name,
    dedicatedName: primaryDedicated ? primaryDedicated.name : null,
    dedicatedVram: primaryDedicated ? primaryDedicated.vram : 0,
    integratedVram: primaryIntegrated.vram
  };
}

function detectGpuWindows() {
  let output = '';
  let commandUsed = 'cim'; // Track which command succeeded
  const POWERSHELL_TIMEOUT = 5000; // 5 second timeout to prevent hanging

  try {
    // Use spawnSync with explicit timeout instead of execSync to avoid ghost processes
    // Fetch Name and AdapterRAM (VRAM in bytes)
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
    
    if (result.error) {
      throw result.error;
    }
    
    if (result.status === 0 && result.stdout) {
      output = result.stdout;
    } else {
      throw new Error(`PowerShell returned status ${result.status || result.signal}`);
    }
  } catch (e) {
    try {
      // Fallback to Get-WmiObject (Older PowerShell)
      commandUsed = 'wmi';
      const result = spawnSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Get-WmiObject Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Csv -NoTypeInformation'
      ], {
        encoding: 'utf8',
        timeout: POWERSHELL_TIMEOUT,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
      
      if (result.error) {
        throw result.error;
      }
      
      if (result.status === 0 && result.stdout) {
        output = result.stdout;
      } else {
        throw new Error(`PowerShell WMI returned status ${result.status || result.signal}`);
      }
    } catch (e2) {
      // Fallback to wmic (Deprecated, often missing on newer Windows)
      // Note: This fallback likely won't provide VRAM in the same reliable CSV format easily, 
      // so we stick to just getting the Name to at least allow the app to launch.
      try {
        commandUsed = 'wmic';
        const result = spawnSync('wmic.exe', ['path', 'win32_VideoController', 'get', 'name'], {
          encoding: 'utf8',
          timeout: POWERSHELL_TIMEOUT,
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true
        });
        
        if (result.error) {
          throw result.error;
        }
        
        if (result.status === 0 && result.stdout) {
          output = result.stdout;
        } else {
          throw new Error(`wmic returned status ${result.status || result.signal}`);
        }
      } catch (err) {
        console.warn('All Windows GPU detection methods failed:', err.message);
        return { mode: 'unknown', vendor: 'none', integratedName: null, dedicatedName: null };
      }
    }
  }

  // Parse lines. 
  // PowerShell CSV output (Get-CimInstance/Get-WmiObject) usually looks like:
  // "Name","AdapterRAM"
  // "NVIDIA GeForce RTX 3060","12884901888"
  //
  // WMIC output is just plain text lines with the name (if we used the wmic command above).

  const lines = output.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  let gpus = {
    integrated: [],
    dedicated: []
  };

  for (const line of lines) {
    // Skip header lines
    if (line.toLowerCase().includes('name') && (line.includes('AdapterRAM') || commandUsed === 'wmic')) {
      continue;
    }

    let name = '';
    let vramBytes = 0;

    if (commandUsed === 'wmic') {
      name = line.trim();
    } else {
      // Parse CSV: "Name","AdapterRAM"
      // Simple regex to handle potential quotes. 
      // This assumes simple CSV structure from ConvertTo-Csv.
      const parts = line.split(','); 
      // Remove surrounding quotes if present
      const rawName = parts[0] ? parts[0].replace(/^"|"$/g, '') : '';
      const rawRam = parts[1] ? parts[1].replace(/^"|"$/g, '') : '0';
      
      name = rawName.trim();
      vramBytes = parseInt(rawRam, 10) || 0;
    }

    if (!name) continue;

    const lowerName = name.toLowerCase();
    const vramMb = Math.round(vramBytes / (1024 * 1024));

    // Logic for dGPU detection; added isIntelArc check
    const isNvidia = lowerName.includes('nvidia');
    const isAmd = lowerName.includes('amd') || lowerName.includes('radeon');
    const isIntelArc = lowerName.includes('arc') && lowerName.includes('intel');

    const gpuInfo = {
      name: name,
      vendor: isNvidia ? 'nvidia' : (isAmd ? 'amd' : (isIntelArc ? 'intel' : 'unknown')),
      vram: vramMb
    };

    if (isNvidia || isAmd || isIntelArc) {
      gpus.dedicated.push(gpuInfo);
    } else if (lowerName.includes('intel') || lowerName.includes('iris') || lowerName.includes('uhd')) {
      gpus.integrated.push(gpuInfo);
    } else {
      // Fallback: If unknown vendor but high VRAM (> 512MB), treat as dedicated? 
      // Or just assume integrated if generic "Microsoft Basic Display Adapter" etc.
      // For now, if we can't identify it as dedicated vendor, put in integrated/other.
      gpus.integrated.push(gpuInfo);
    }
  }

  const primaryDedicated = gpus.dedicated[0] || null;
  const primaryIntegrated = gpus.integrated[0] || { name: 'Intel GPU', vram: 0 };

  return {
    mode: primaryDedicated ? 'dedicated' : 'integrated',
    vendor: primaryDedicated ? primaryDedicated.vendor : 'intel', // Default to intel if only integrated found
    integratedName: primaryIntegrated.name,
    dedicatedName: primaryDedicated ? primaryDedicated.name : null,
    // Add VRAM info if available (mostly for debug or UI)
    dedicatedVram: primaryDedicated ? primaryDedicated.vram : 0,
    integratedVram: primaryIntegrated.vram
  };
}

function detectGpuMac() {
  let output = '';
  try {
    output = execSync('system_profiler SPDisplaysDataType', { encoding: 'utf8' });
  } catch (e) {
    return { mode: 'integrated', vendor: 'intel', integratedName: 'Unknown', dedicatedName: null };
  }

  const lines = output.split('\n');
  let gpus = {
    integrated: [],
    dedicated: []
  };

  let currentGpu = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // New block starts with "Chipset Model:"
    if (trimmed.startsWith('Chipset Model:')) {
      if (currentGpu) {
        // Push previous
        categorizeMacGpu(currentGpu, gpus);
      }
      currentGpu = {
        name: trimmed.split(':')[1].trim(),
        vendor: 'unknown',
        vram: 0
      };
    } else if (currentGpu) {
      if (trimmed.startsWith('VRAM (Total):') || trimmed.startsWith('VRAM (Dynamic, Max):')) {
          // Parse VRAM: "1.5 GB" or "1536 MB"
          const valParts = trimmed.split(':')[1].trim().split(' ');
          let val = parseFloat(valParts[0]);
          if (valParts[1] && valParts[1].toUpperCase() === 'GB') {
            val = val * 1024;
          }
          currentGpu.vram = Math.round(val);
      } else if (trimmed.startsWith('Vendor:') || trimmed.startsWith('Vendor Name:')) {
          // "Vendor: NVIDIA (0x10de)"
          const v = trimmed.split(':')[1].toLowerCase();
          if (v.includes('nvidia')) currentGpu.vendor = 'nvidia';
          else if (v.includes('amd') || v.includes('ati')) currentGpu.vendor = 'amd';
          else if (v.includes('intel')) currentGpu.vendor = 'intel';
          else if (v.includes('apple')) currentGpu.vendor = 'apple';
      }
    }
  }
  // Push last one
  if (currentGpu) {
    categorizeMacGpu(currentGpu, gpus);
  }

  // If we have an Apple Silicon GPU (vendor=apple) but VRAM is 0, fetch system memory as it is unified.
  gpus.dedicated.forEach(gpu => {
    if (gpu.vendor === 'apple' && gpu.vram === 0) {
      try {
        const memSize = execSync('sysctl -n hw.memsize', { encoding: 'utf8' }).trim();
        // memSize is in bytes
        const memMb = Math.round(parseInt(memSize, 10) / (1024 * 1024));
        if (memMb > 0) gpu.vram = memMb;
      } catch (err) {
        // ignore
      }
    }
  });

  const primaryDedicated = gpus.dedicated[0] || null;
  const primaryIntegrated = gpus.integrated[0] || { name: 'Integrated GPU', vram: 0 };

  return {
    mode: primaryDedicated ? 'dedicated' : 'integrated',
    vendor: primaryDedicated ? primaryDedicated.vendor : (gpus.integrated[0] ? gpus.integrated[0].vendor : 'intel'),
    integratedName: primaryIntegrated.name,
    dedicatedName: primaryDedicated ? primaryDedicated.name : null,
    dedicatedVram: primaryDedicated ? primaryDedicated.vram : 0,
    integratedVram: primaryIntegrated.vram
  };
}

function categorizeMacGpu(gpu, gpus) {
  const lowerName = gpu.name.toLowerCase();
  
  // Refine vendor if still unknown
  if (gpu.vendor === 'unknown') {
     if (lowerName.includes('nvidia')) gpu.vendor = 'nvidia';
     else if (lowerName.includes('amd') || lowerName.includes('radeon')) gpu.vendor = 'amd';
     else if (lowerName.includes('intel')) gpu.vendor = 'intel';
     else if (lowerName.includes('apple') || lowerName.includes('m1') || lowerName.includes('m2') || lowerName.includes('m3')) gpu.vendor = 'apple';
  }

  const isNvidia = gpu.vendor === 'nvidia';
  const isAmd = gpu.vendor === 'amd';
  const isApple = gpu.vendor === 'apple';
  
  // Per user request, "project is not meant for Intel Mac (x86)", 
  // so we treat Apple Silicon as the primary "dedicated-like" GPU for this app's context.
  
  if (isNvidia || isAmd || isApple) {
    gpus.dedicated.push(gpu);
  } else {
    // Intel or unknown
    gpus.integrated.push(gpu);
  }
}

function setupGpuEnvironment(gpuPreference) {
  if (process.platform !== 'linux') {
    return {};
  }

  let finalPreference = gpuPreference;
  let detected = detectGpu();

  if (gpuPreference === 'auto') {
    finalPreference = detected.mode;
    console.log(`Auto-detected GPU: ${detected.vendor} (${detected.mode})`);
  }

  console.log('Preferred GPU set to:', finalPreference);

  const envVars = {};

  if (finalPreference === 'dedicated') {
    if (detected.vendor === 'nvidia') {
      envVars.__NV_PRIME_RENDER_OFFLOAD = '1';
      envVars.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';
      const nvidiaEglFile = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';
      if (fs.existsSync(nvidiaEglFile)) {
        envVars.__EGL_VENDOR_LIBRARY_FILENAMES = nvidiaEglFile;
      } else {
        console.warn('NVIDIA EGL vendor library file not found, not setting __EGL_VENDOR_LIBRARY_FILENAMES');
      }
    } else {
      envVars.DRI_PRIME = '1';
    }
    console.log('GPU environment variables:', envVars);
  } else {
    console.log('Using integrated GPU, no environment variables set');
  }
  return envVars;
}

function getSystemType() {
  const platform = getOS();
  try {
    if (platform === 'linux') return getSystemTypeLinux();
    if (platform === 'windows') return getSystemTypeWindows();
    if (platform === 'darwin') return getSystemTypeMac();
    return 'desktop'; // Default to desktop if unknown
  } catch (err) {
    console.warn('Failed to detect system type, defaulting to desktop:', err.message);
    return 'desktop';
  }
}

function getSystemTypeLinux() {
  try {
    // Try reliable DMI check first
    if (fs.existsSync('/sys/class/dmi/id/chassis_type')) {
      const type = parseInt(fs.readFileSync('/sys/class/dmi/id/chassis_type', 'utf8').trim());
      // 8=Portable, 9=Laptop, 10=Notebook, 11=Hand Held, 12=Docking Station, 14=Sub Notebook
      if ([8, 9, 10, 11, 12, 14, 31, 32].includes(type)) {
        return 'laptop';
      }
    }
    // Fallback to chassis_id for some systems? Usually chassis_type is enough.
    return 'desktop';
  } catch (e) {
    return 'desktop';
  }
}

function getSystemTypeWindows() {
  const POWERSHELL_TIMEOUT = 5000; // 5 second timeout
  
  try {
    // Use spawnSync instead of execSync to avoid ghost processes
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      'Get-CimInstance Win32_SystemEnclosure | Select-Object -ExpandProperty ChassisTypes'
    ], {
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    
    if (result.error || result.status !== 0) {
      throw new Error(`PowerShell failed: ${result.error?.message || result.signal}`);
    }
    
    const output = (result.stdout || '').trim();
    // Output might be a single number or array.
    // Clean it up
    const types = output.split(/\s+/).map(t => parseInt(t)).filter(n => !isNaN(n));
    
    // Laptop codes: 8, 9, 10, 11, 12, 14, 31, 32
    const laptopCodes = [8, 9, 10, 11, 12, 14, 31, 32];
    
    for (const t of types) {
      if (laptopCodes.includes(t)) return 'laptop';
    }
    return 'desktop';
  } catch (e) {
    // Fallback wmic
    try {
      const result = spawnSync('wmic.exe', ['path', 'win32_systemenclosure', 'get', 'chassistypes'], {
        encoding: 'utf8',
        timeout: POWERSHELL_TIMEOUT,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
      
      if (result.status === 0 && result.stdout) {
        const output = result.stdout.trim();
        if (output.includes('8') || output.includes('9') || output.includes('10') || output.includes('14')) {
          return 'laptop';
        }
      }
    } catch (err) {
      console.warn('System type detection failed:', err.message);
    }
    return 'desktop';
  }
}

function getSystemTypeMac() {
  try {
    const model = execSync('sysctl -n hw.model', { encoding: 'utf8' }).trim().toLowerCase();
    if (model.includes('book')) return 'laptop';
    return 'desktop';
  } catch (e) {
    return 'desktop';
  }
}

module.exports = {
  getOS,
  getArch,
  isWaylandSession,
  setupWaylandEnvironment,
  detectGpu,
  setupGpuEnvironment,
  getSystemType
};

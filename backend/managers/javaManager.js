const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const tar = require('tar');
const { expandHome, JRE_DIR } = require('../core/paths');
const { getOS, getArch } = require('../utils/platformUtils');
const { loadConfig } = require('../core/config');
const { downloadFile, retryDownload } = require('../utils/fileManager');

const execFileAsync = promisify(execFile);
const JAVA_EXECUTABLE = 'java' + (process.platform === 'win32' ? '.exe' : '');

async function findJavaOnPath(commandName = 'java') {
  const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(lookupCmd, [commandName]);
    const line = stdout.split(/\r?\n/).map(lineItem => lineItem.trim()).find(Boolean);
    return line || null;
  } catch (err) {
    return null;
  }
}

async function getMacJavaHome() {
  if (process.platform !== 'darwin') {
    return null;
  }
  try {
    const { stdout } = await execFileAsync('/usr/libexec/java_home');
    const home = stdout.trim();
    if (!home) {
      return null;
    }
    return path.join(home, 'bin', JAVA_EXECUTABLE);
  } catch (err) {
    return null;
  }
}

async function resolveJavaPath(inputPath) {
  const trimmed = (inputPath || '').trim();
  if (!trimmed) {
    return null;
  }

  const expanded = expandHome(trimmed);
  if (fs.existsSync(expanded)) {
    const stat = fs.statSync(expanded);
    if (stat.isDirectory()) {
      const candidate = path.join(expanded, 'bin', JAVA_EXECUTABLE);
      return fs.existsSync(candidate) ? candidate : null;
    }
    return expanded;
  }

  if (!path.isAbsolute(expanded)) {
    return await findJavaOnPath(trimmed);
  }

  return null;
}

async function detectSystemJava() {
  const envHome = process.env.JAVA_HOME;
  if (envHome) {
    const envJava = path.join(envHome, 'bin', JAVA_EXECUTABLE);
    if (fs.existsSync(envJava)) {
      return envJava;
    }
  }

  const macJava = await getMacJavaHome();
  if (macJava && fs.existsSync(macJava)) {
    return macJava;
  }

  const pathJava = await findJavaOnPath('java');
  if (pathJava && fs.existsSync(pathJava)) {
    return pathJava;
  }

  return null;
}

function loadJavaPath() {
  const config = loadConfig();
  return config.javaPath || '';
}

function getBundledJavaPath(jreDir = JRE_DIR) {
  const candidates = [
    path.join(jreDir, 'bin', JAVA_EXECUTABLE)
  ];

  if (process.platform === 'darwin') {
    candidates.push(path.join(jreDir, 'Contents', 'Home', 'bin', JAVA_EXECUTABLE));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getJavaExec(jreDir = JRE_DIR) {
  const bundledJava = getBundledJavaPath(jreDir);
  if (bundledJava) {
    return bundledJava;
  }

  console.log('Notice: Java runtime not found, using system default');
  return 'java';
}

async function getJavaDetection() {
  const candidates = [];
  const bundledJava = getBundledJavaPath() || path.join(JRE_DIR, 'bin', JAVA_EXECUTABLE);

  candidates.push({
    label: 'Bundled JRE',
    path: bundledJava,
    exists: fs.existsSync(bundledJava)
  });

  const javaHomeEnv = process.env.JAVA_HOME;
  if (javaHomeEnv) {
    const envJava = path.join(javaHomeEnv, 'bin', JAVA_EXECUTABLE);
    candidates.push({
      label: 'JAVA_HOME',
      path: envJava,
      exists: fs.existsSync(envJava),
      note: fs.existsSync(envJava) ? '' : 'Not found'
    });
  } else {
    candidates.push({
      label: 'JAVA_HOME',
      path: '',
      exists: false,
      note: 'Not set'
    });
  }

  if (process.platform === 'darwin') {
    const macJava = await getMacJavaHome();
    if (macJava) {
      candidates.push({
        label: 'java_home',
        path: macJava,
        exists: fs.existsSync(macJava),
        note: fs.existsSync(macJava) ? '' : 'Not found'
      });
    } else {
      candidates.push({
        label: 'java_home',
        path: '',
        exists: false,
        note: 'Not found'
      });
    }
  }

  const pathJava = await findJavaOnPath('java');
  if (pathJava) {
    candidates.push({
      label: 'PATH',
      path: pathJava,
      exists: true
    });
  } else {
    candidates.push({
      label: 'PATH',
      path: '',
      exists: false,
      note: 'java not found'
    });
  }

  return {
    javaPath: loadJavaPath(),
    candidates
  };
}

// Manual retry function for JRE downloads
async function retryJREDownload(url, cacheFile, progressCallback) {
  console.log('Initiating manual JRE retry...');
  
  // Ensure cache directory exists before retrying
  const cacheDir = path.dirname(cacheFile);
  if (!fs.existsSync(cacheDir)) {
    console.log('Creating JRE cache directory:', cacheDir);
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  return await retryDownload(url, cacheFile, progressCallback);
}

async function downloadJRE(progressCallback, cacheDir, jreDir = JRE_DIR) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const osName = getOS();
  const arch = getArch();

  const bundledJava = getBundledJavaPath(jreDir);
  if (bundledJava) {
    console.log('Java runtime found, skipping download');
    return;
  }

  console.log('Requesting Java runtime information...');
  const response = await axios.get('https://launcher.hytale.com/version/release/jre.json', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const jreData = response.data;

  const osData = jreData.download_url[osName];
  if (!osData) {
    throw new Error(`Java runtime unavailable for platform: ${osName}`);
  }

  const platform = osData[arch];
  if (!platform) {
    throw new Error(`Java runtime unavailable for architecture ${arch} on ${osName}`);
  }

  const fileName = path.basename(platform.url);
  const cacheFile = path.join(cacheDir, fileName);

  if (!fs.existsSync(cacheFile)) {
    if (progressCallback) {
      progressCallback('Fetching Java runtime...', null, null, null, null);
    }
    console.log('Fetching Java runtime...');
    let jreFile;
    try {
      jreFile = await downloadFile(platform.url, cacheFile, progressCallback);
      
      // If downloadFile returns false or undefined, it means the download failed
      // We should retry the download with a manual retry
      if (!jreFile || typeof jreFile !== 'string') {
        console.log('[JRE Download] JRE file download failed or incomplete, attempting retry...');
        jreFile = await retryJREDownload(platform.url, cacheFile, progressCallback);
      }
      
      // Double-check we have a valid file
      if (!jreFile || typeof jreFile !== 'string') {
        throw new Error(`JRE download failed: received invalid path ${jreFile}. Please retry download.`);
      }
      
    } catch (downloadError) {
      console.error('[JRE Download] JRE download failed:', downloadError.message);
      
      // Enhance error with retry information for the UI
      const enhancedError = new Error(`JRE download failed: ${downloadError.message}`);
      enhancedError.originalError = downloadError;
      enhancedError.canRetry = downloadError.isConnectionLost ? false : (downloadError.canRetry !== false);
      enhancedError.jreUrl = platform.url;
      enhancedError.jreDest = cacheFile;
      enhancedError.osName = osName;
      enhancedError.arch = arch;
      enhancedError.fileName = fileName;
      enhancedError.cacheDir = cacheDir;
      enhancedError.isJREError = true; // Flag to identify JRE errors
      enhancedError.isConnectionLost = downloadError.isConnectionLost || false;
      
      throw enhancedError;
    }
    console.log('Download finished');
  }

  if (progressCallback) {
    progressCallback('Validating files...', null, null, null, null);
  }
  console.log('Validating files...');
  const fileBuffer = fs.readFileSync(cacheFile);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  
  if (hex !== platform.sha256) {
    fs.unlinkSync(cacheFile);
    throw new Error(`File validation failed: expected ${platform.sha256} but got ${hex}`);
  }

  if (progressCallback) {
    progressCallback('Unpacking Java runtime...', null, null, null, null);
  }
  console.log('Unpacking Java runtime...');
  await extractJRE(cacheFile, jreDir);

  if (process.platform !== 'win32') {
    const javaCandidates = [
      path.join(jreDir, 'bin', JAVA_EXECUTABLE),
      path.join(jreDir, 'Contents', 'Home', 'bin', JAVA_EXECUTABLE)
    ];
    for (const javaPath of javaCandidates) {
      if (fs.existsSync(javaPath)) {
        fs.chmodSync(javaPath, 0o755);
      }
    }
  }

  flattenJREDir(jreDir);

  try {
    fs.unlinkSync(cacheFile);
  } catch (err) {
    console.log('Notice: could not delete cached Java files:', err.message);
  }

  console.log('Java runtime ready');
}

async function extractJRE(archivePath, destDir) {
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  if (archivePath.endsWith('.zip')) {
    return extractZip(archivePath, destDir);
  } else if (archivePath.endsWith('.tar.gz')) {
    return extractTarGz(archivePath, destDir);
  } else {
    throw new Error(`Archive type not supported: ${archivePath}`);
  }
}

function extractZip(zipPath, dest) {
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      const entryPath = path.join(dest, entry.entryName);

      // Security check: prevent zip slip attacks
      const resolvedPath = path.resolve(entryPath);
      const resolvedDest = path.resolve(dest);
      if (!resolvedPath.startsWith(resolvedDest)) {
        throw new Error(`Invalid file path detected: ${entryPath}`);
      }

      try {
        if (entry.isDirectory) {
          fs.mkdirSync(entryPath, { recursive: true });
        } else {
          // Ensure parent directory exists
          const parentDir = path.dirname(entryPath);
          fs.mkdirSync(parentDir, { recursive: true });

          // Get file data and write it
          const data = entry.getData();
          if (!data) {
            console.warn(`Warning: No data for file ${entry.entryName}, skipping`);
            continue;
          }

          fs.writeFileSync(entryPath, data);

          // Set permissions on non-Windows platforms
          if (process.platform !== 'win32') {
            try {
              const mode = entry.header.attr >>> 16;
              if (mode > 0) {
                fs.chmodSync(entryPath, mode);
              }
            } catch (chmodError) {
              console.warn(`Warning: Could not set permissions for ${entryPath}: ${chmodError.message}`);
            }
          }
        }
      } catch (entryError) {
        console.error(`Error extracting ${entry.entryName}: ${entryError.message}`);
        // Continue with other entries rather than failing completely
        continue;
      }
    }
  } catch (error) {
    throw new Error(`Failed to extract ZIP archive: ${error.message}`);
  }
}

function extractTarGz(tarGzPath, dest) {
  try {
    return tar.extract({
      file: tarGzPath,
      cwd: dest,
      strip: 0
    });
  } catch (error) {
    throw new Error(`Failed to extract TAR.GZ archive: ${error.message}`);
  }
}

function flattenJREDir(jreLatest) {
  try {
    const entries = fs.readdirSync(jreLatest, { withFileTypes: true });
    
    if (entries.length !== 1 || !entries[0].isDirectory()) {
      return;
    }

    const nested = path.join(jreLatest, entries[0].name);
    const files = fs.readdirSync(nested, { withFileTypes: true });

    for (const file of files) {
      const oldPath = path.join(nested, file.name);
      const newPath = path.join(jreLatest, file.name);
      fs.renameSync(oldPath, newPath);
    }

    fs.rmSync(nested, { recursive: true, force: true });
  } catch (err) {
    console.log('Notice: could not restructure Java directory:', err.message);
  }
}

module.exports = {
  findJavaOnPath,
  getMacJavaHome,
  resolveJavaPath,
  detectSystemJava,
  loadJavaPath,
  getBundledJavaPath,
  getJavaExec,
  getJavaDetection,
  downloadJRE,
  extractJRE,
  retryJREDownload,
  JAVA_EXECUTABLE
};

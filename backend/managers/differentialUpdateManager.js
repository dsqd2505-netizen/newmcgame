const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { downloadFile, retryDownload } = require('../utils/fileManager');
const { getOS, getArch } = require('../utils/platformUtils');
const { validateChecksum, extractVersionDetails, canUseDifferentialUpdate, needsIntermediatePatches, getInstalledClientVersion } = require('../services/versionManager');
const { installButler } = require('./butlerManager');
const { GAME_DIR, CACHE_DIR, TOOLS_DIR } = require('../core/paths');
const { saveVersionClient } = require('../core/config');

async function acquireGameArchive(downloadUrl, targetPath, checksum, progressCallback, allowRetry = true) {
  const osName = getOS();
  const arch = getArch();

  if (osName === 'darwin' && arch === 'amd64') {
    throw new Error('Hytale x86_64 Intel Mac Support has not been released yet. Please check back later.');
  }

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    if (stats.size > 1024 * 1024) {
      const isValid = await validateChecksum(targetPath, checksum);
      if (isValid) {
        console.log(`Valid archive found in cache: ${targetPath}`);
        return targetPath;
      }
      console.log('Cached archive checksum mismatch, re-downloading');
      fs.unlinkSync(targetPath);
    }
  }

  console.log(`Downloading game archive from: ${downloadUrl}`);
  
  try {
    if (allowRetry) {
      await retryDownload(downloadUrl, targetPath, progressCallback);
    } else {
      await downloadFile(downloadUrl, targetPath, progressCallback);
    }
  } catch (error) {
    const enhancedError = new Error(`Archive download failed: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.downloadUrl = downloadUrl;
    enhancedError.targetPath = targetPath;
    throw enhancedError;
  }

  const stats = fs.statSync(targetPath);
  console.log(`Archive downloaded, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  const isValid = await validateChecksum(targetPath, checksum);
  if (!isValid) {
    console.log('Downloaded archive checksum validation failed, removing corrupted file');
    fs.unlinkSync(targetPath);
    throw new Error('Downloaded archive is corrupted or invalid. Please retry');
  }

  console.log(`Archive validation passed: ${targetPath}`);
  return targetPath;
}

async function deployGameArchive(archivePath, destinationDir, toolsDir, progressCallback, isDifferential = false) {
  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath || 'undefined'}`);
  }

  const stats = fs.statSync(archivePath);
  console.log(`Deploying archive: ${archivePath}`);
  console.log(`Archive size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Deployment mode: ${isDifferential ? 'differential' : 'full'}`);

  const butlerPath = await installButler(toolsDir);
  const stagingDir = path.join(destinationDir, 'staging-temp');

  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  if (progressCallback) {
    progressCallback(isDifferential ? 'Applying differential update...' : 'Installing game files...', null, null, null, null);
  }

  const args = [
    'apply',
    '--staging-dir',
    stagingDir,
    archivePath,
    destinationDir
  ];

  console.log(`Executing deployment: ${butlerPath} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = execFile(butlerPath, args, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: 600000
    }, (error, stdout, stderr) => {
      if (error) {
        const cleanStderr = stderr.replace(/[\u2714\u2716\u2713\u2717\u26A0\uD83D[\uDC00-\uDFFF]]/g, '').trim();
        const cleanStdout = stdout.replace(/[\u2714\u2716\u2713\u2717\u26A0\uD83D[\uDC00-\uDFFF]]/g, '').trim();
        
        if (cleanStderr) console.error('Deployment stderr:', cleanStderr);
        if (cleanStdout) console.error('Deployment stdout:', cleanStdout);
        
        const errorText = (stderr + ' ' + error.message).toLowerCase();
        let message = 'Game deployment failed';
        
        if (errorText.includes('unexpected eof')) {
          message = 'Corrupted archive detected. Please retry download.';
          if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
          }
        } else if (errorText.includes('permission denied')) {
          message = 'Permission denied. Check file permissions and try again.';
        } else if (errorText.includes('no space left') || errorText.includes('device full')) {
          message = 'Insufficient disk space. Free up space and try again.';
        }

        const deployError = new Error(message);
        deployError.originalError = error;
        deployError.stderr = cleanStderr;
        deployError.stdout = cleanStdout;
        return reject(deployError);
      }

      console.log('Game deployment completed successfully');
      const cleanOutput = stdout.replace(/[\u2714\u2716\u2713\u2717\u26A0\uD83D[\uDC00-\uDFFF]]/g, '').trim();
      if (cleanOutput) {
        console.log(cleanOutput);
      }

      if (fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.warn('Failed to cleanup staging directory:', cleanupErr.message);
        }
      }

      resolve();
    });

    child.on('error', (err) => {
      console.error('Deployment process error:', err);
      reject(new Error(`Failed to execute deployment tool: ${err.message}`));
    });
  });
}

async function performIntelligentUpdate(targetVersion, branch = 'release', progressCallback, gameDir = GAME_DIR, cacheDir = CACHE_DIR, toolsDir = TOOLS_DIR) {
  console.log(`Initiating intelligent update to version ${targetVersion}`);

  const currentVersion = getInstalledClientVersion();
  console.log(`Current version: ${currentVersion || 'none (clean install)'}`);
  console.log(`Target version: ${targetVersion}`);
  console.log(`Branch: ${branch}`);

  if (branch !== 'release') {
    console.log(`Pre-release branch detected - forcing full archive download`);
    const versionDetails = await extractVersionDetails(targetVersion, branch);
    const archiveName = path.basename(versionDetails.fullUrl);
    const archivePath = path.join(cacheDir, `${branch}_${archiveName}`);
    
    if (progressCallback) {
      progressCallback('Downloading full game archive (pre-release)...', 0, null, null, null);
    }
    
    await acquireGameArchive(versionDetails.fullUrl, archivePath, null, progressCallback);
    await deployGameArchive(archivePath, gameDir, toolsDir, progressCallback, false);
    saveVersionClient(targetVersion);
    console.log(`Pre-release installation completed. Version ${targetVersion} is now installed.`);
    return;
  }

  if (!currentVersion) {
    console.log('No existing installation detected - downloading full archive');
    const versionDetails = await extractVersionDetails(targetVersion, branch);
    const archiveName = path.basename(versionDetails.fullUrl);
    const archivePath = path.join(cacheDir, `${branch}_${archiveName}`);
    
    if (progressCallback) {
      progressCallback(`Downloading full game archive (first install - v${targetVersion})...`, 0, null, null, null);
    }
    
    await acquireGameArchive(versionDetails.fullUrl, archivePath, null, progressCallback);
    await deployGameArchive(archivePath, gameDir, toolsDir, progressCallback, false);
    saveVersionClient(targetVersion);
    console.log(`Initial installation completed. Version ${targetVersion} is now installed.`);
    return;
  }

  const patchesToApply = needsIntermediatePatches(currentVersion, targetVersion);
  
  if (patchesToApply.length === 0) {
    console.log('Already at target version or invalid version sequence');
    return;
  }

  console.log(`Applying ${patchesToApply.length} differential patch(es): ${patchesToApply.join(' -> ')}`);

  for (let i = 0; i < patchesToApply.length; i++) {
    const patchVersion = patchesToApply[i];
    const versionDetails = await extractVersionDetails(patchVersion, branch);
    
    const canDifferential = canUseDifferentialUpdate(getInstalledClientVersion(), versionDetails);
    
    if (!canDifferential || !versionDetails.differentialUrl) {
      console.log(`WARNING: Differential patch not available for ${patchVersion}, using full archive`);
      const archiveName = path.basename(versionDetails.fullUrl);
      const archivePath = path.join(cacheDir, `${branch}_${archiveName}`);
      
      if (progressCallback) {
        progressCallback(`Downloading full archive for ${patchVersion} (${i + 1}/${patchesToApply.length})...`, 0, null, null, null);
      }
      
      await acquireGameArchive(versionDetails.fullUrl, archivePath, null, progressCallback);
      await deployGameArchive(archivePath, gameDir, toolsDir, progressCallback, false);
    } else {
      console.log(`Applying differential patch: ${versionDetails.sourceVersion} -> ${patchVersion}`);
      const archiveName = path.basename(versionDetails.differentialUrl);
      const archivePath = path.join(cacheDir, `${branch}_patch_${archiveName}`);
      
      if (progressCallback) {
        progressCallback(`Applying patch ${i + 1}/${patchesToApply.length}: ${patchVersion}...`, 0, null, null, null);
      }
      
      await acquireGameArchive(versionDetails.differentialUrl, archivePath, versionDetails.checksum, progressCallback);
      await deployGameArchive(archivePath, gameDir, toolsDir, progressCallback, true);
      
      if (fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
          console.log(`Cleaned up patch file: ${archiveName}`);
        } catch (cleanupErr) {
          console.warn(`Failed to cleanup patch file: ${cleanupErr.message}`);
        }
      }
    }
    
    saveVersionClient(patchVersion);
    console.log(`Patch ${patchVersion} applied successfully (${i + 1}/${patchesToApply.length})`);
  }

  console.log(`Update completed successfully. Version ${targetVersion} is now installed.`);
}

async function ensureGameInstalled(targetVersion, branch = 'release', progressCallback, gameDir = GAME_DIR, cacheDir = CACHE_DIR, toolsDir = TOOLS_DIR) {
  const { findClientPath } = require('../core/paths');
  const clientPath = findClientPath(gameDir);

  if (clientPath) {
    const currentVersion = getInstalledClientVersion();
    if (currentVersion === targetVersion) {
      console.log(`Game already installed at correct version: ${targetVersion}`);
      return;
    }
  }

  await performIntelligentUpdate(targetVersion, branch, progressCallback, gameDir, cacheDir, toolsDir);
}

module.exports = {
  acquireGameArchive,
  deployGameArchive,
  performIntelligentUpdate,
  ensureGameInstalled
};

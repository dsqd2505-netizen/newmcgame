const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { TOOLS_DIR } = require('../core/paths');
const { getOS, getArch } = require('../utils/platformUtils');
const { downloadFile } = require('../utils/fileManager');

async function installButler(toolsDir = TOOLS_DIR) {
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }
  
  const butlerName = process.platform === 'win32' ? 'butler.exe' : 'butler';
  const butlerPath = path.join(toolsDir, butlerName);
  const zipPath = path.join(toolsDir, 'butler.zip');

  if (fs.existsSync(butlerPath)) {
    return butlerPath;
  }

  let urls = [];
  const osName = getOS();
  const arch = getArch();
  if (osName === 'windows') {
    urls = ['https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default'];
  } else if (osName === 'darwin') {
    if (arch === 'arm64') {
      urls = [
        'https://broth.itch.zone/butler/darwin-arm64/LATEST/archive/default',
        'https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default'
      ];
    } else {
      urls = ['https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default'];
    }
  } else if (osName === 'linux') {
    urls = ['https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default'];
  } else {
    throw new Error('Operating system not supported');
  }

  console.log('Fetching Butler tool...');
  let lastError = null;
  for (const url of urls) {
    try {
      await downloadFile(url, zipPath);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }

  console.log('Unpacking Butler...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(toolsDir, true);

  if (process.platform !== 'win32') {
    fs.chmodSync(butlerPath, 0o755);
  }

  try {
    fs.unlinkSync(zipPath);
  } catch (err) {
    console.log('Notice: could not delete butler.zip');
  }

  return butlerPath;
}

module.exports = {
  installButler
};

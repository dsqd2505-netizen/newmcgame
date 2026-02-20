const fs = require('fs');
const path = require('path');
const { downloadFile, findHomePageUIPath, findLogoPath } = require('../utils/fileManager');
const { smartRequest } = require('../utils/proxyClient');

async function downloadAndReplaceHomePageUI(gameDir, progressCallback) {
  try {
    console.log('Downloading HomePage.ui from server...');
    
    if (progressCallback) {
      progressCallback('Downloading HomePage.ui...', null, null, null, null);
    }

    const homeUIUrl = 'https://files.hytalef2p.com/api/HomeUI';
    const tempHomePath = path.join(path.dirname(gameDir), 'HomePage_temp.ui');

    const response = await smartRequest(homeUIUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(tempHomePath, response.data);

    const existingHomePath = findHomePageUIPath(gameDir);
    
    if (existingHomePath && fs.existsSync(existingHomePath)) {
      console.log('Found existing HomePage.ui at:', existingHomePath);
      
      const backupPath = existingHomePath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(existingHomePath, backupPath);
        console.log('Original HomePage.ui backed up');
      }
      
      fs.copyFileSync(tempHomePath, existingHomePath);
      console.log('HomePage.ui replaced successfully');
    } else {
      console.log('No existing HomePage.ui found, skipping replacement');
    }
    
    if (fs.existsSync(tempHomePath)) {
      fs.unlinkSync(tempHomePath);
    }
    
    if (progressCallback) {
      progressCallback('HomePage.ui updated', null, null, null, null);
    }
    
    return { success: true, updated: true };

  } catch (error) {
    console.error('Error downloading/replacing HomePage.ui:', error);
    
    const tempHomePath = path.join(path.dirname(gameDir), 'HomePage_temp.ui');
    if (fs.existsSync(tempHomePath)) {
      fs.unlinkSync(tempHomePath);
    }
    
    console.log('HomePage.ui update failed, continuing...');
    return { success: false, error: error.message };
  }
}

async function downloadAndReplaceLogo(gameDir, progressCallback) {
  try {
    console.log('Downloading Logo@2x.png from server...');
    
    if (progressCallback) {
      progressCallback('Downloading Logo@2x.png...', null, null, null, null);
    }

    const logoUrl = 'https://files.hytalef2p.com/api/Logo';
    const tempLogoPath = path.join(path.dirname(gameDir), 'Logo@2x_temp.png');

    const response = await smartRequest(logoUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(tempLogoPath, response.data);

    const existingLogoPath = findLogoPath(gameDir);
    
    if (existingLogoPath && fs.existsSync(existingLogoPath)) {
      console.log('Found existing Logo@2x.png at:', existingLogoPath);
      
      const backupPath = existingLogoPath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(existingLogoPath, backupPath);
        console.log('Original Logo@2x.png backed up');
      }
      
      fs.copyFileSync(tempLogoPath, existingLogoPath);
      console.log('Logo@2x.png replaced successfully');
    } else {
      console.log('No existing Logo@2x.png found, skipping replacement');
    }
    
    if (fs.existsSync(tempLogoPath)) {
      fs.unlinkSync(tempLogoPath);
    }
    
    if (progressCallback) {
      progressCallback('Logo@2x.png updated', null, null, null, null);
    }
    
    return { success: true, updated: true };

  } catch (error) {
    console.error('Error downloading/replacing Logo@2x.png:', error);
    
    const tempLogoPath = path.join(path.dirname(gameDir), 'Logo@2x_temp.png');
    if (fs.existsSync(tempLogoPath)) {
      fs.unlinkSync(tempLogoPath);
    }
    
    console.log('Logo@2x.png update failed, continuing...');
    return { success: false, error: error.message };
  }
}

module.exports = {
  downloadAndReplaceHomePageUI,
  findHomePageUIPath,
  downloadAndReplaceLogo,
  findLogoPath
};

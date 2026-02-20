const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getHytaleSavesDir } = require('../core/paths');

const SERVER_LIST_URL = 'https://assets.authbp.xyz/server.json';


function getLocalDateTime() {
  return formatLocalDateTime(new Date());
}

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    const offsetMinutes = -date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}0000${offset}`;
}

async function syncServerList() {
  try {
    const hytaleSavesDir = getHytaleSavesDir();
    const serverListPath = path.join(hytaleSavesDir, 'ServerList.json');
    console.log('[ServerListSync] Fetching server list from', SERVER_LIST_URL);
    let remoteData;
    try {
      const response = await axios.get(SERVER_LIST_URL, {
        timeout: 40000,
        headers: {
          'User-Agent': 'Hytale-F2P-Launcher'
        }
      });
      remoteData = response.data;
    } catch (fetchError) {
      console.warn('[ServerListSync] Failed to fetch remote server list:', fetchError.message);
      remoteData = { SavedServers: [] };
    }
    let localData = { SavedServers: [] };
    if (fs.existsSync(serverListPath)) {
      try {
        const localContent = fs.readFileSync(serverListPath, 'utf-8');
        localData = JSON.parse(localContent);
        console.log('[ServerListSync] Loaded existing local server list with', localData.SavedServers?.length || 0, 'servers');
      } catch (parseError) {
        console.warn('[ServerListSync] Failed to parse local server list, creating new one:', parseError.message);
        localData = { SavedServers: [] };
      }
    } else {
      console.log('[ServerListSync] Local server list does not exist, creating new one');
    }

    if (!localData.SavedServers) {
      localData.SavedServers = [];
    }
    if (!remoteData.SavedServers) {
      remoteData.SavedServers = [];
    }

    const existingServersByAddress = new Map();
    const userServers = [];
    
    for (const server of localData.SavedServers) {
      existingServersByAddress.set(server.Address.toLowerCase(), server);
    }

    const remoteAddresses = new Set(remoteData.SavedServers.map(s => s.Address.toLowerCase()));
    for (const server of localData.SavedServers) {
      if (!remoteAddresses.has(server.Address.toLowerCase())) {
        userServers.push(server);
      }
    }
    
    const currentDate = getLocalDateTime();
    
    
    const apiServers = [];
    for (const remoteServer of remoteData.SavedServers) {
      const serverToAdd = {
        Id: uuidv4(), 
        Name: "@ " + remoteServer.Name, 
        Address: remoteServer.Address,
        DateSaved: currentDate,
        img_Banner: remoteServer.img_Banner || null // Copy banner if exists
      };
      apiServers.push(serverToAdd);
      console.log('[ServerListSync] Added/Updated server with new ID:', remoteServer.Name);
    }
    
    localData.SavedServers = [...apiServers, ...userServers];
    
    const addedCount = apiServers.length;

    if (!fs.existsSync(hytaleSavesDir)) {
      fs.mkdirSync(hytaleSavesDir, { recursive: true });
    }
    
    fs.writeFileSync(serverListPath, JSON.stringify(localData, null, 2), 'utf-8');
    console.log('[ServerListSync] Server list synchronized:', addedCount, 'API servers added, total:', localData.SavedServers.length);

    return { success: true, added: addedCount, total: localData.SavedServers.length };
  } catch (error) {
    console.error('[ServerListSync] Failed to synchronize server list:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  syncServerList
};

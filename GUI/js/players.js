
const API_URL = 'https://api.hytalef2p.com/api';
let updateInterval = null;
let currentUserId = null;

export async function initPlayersCounter() {
  setupPlayersCounter();
  
  if (window.electronAPI && window.electronAPI.getUserId) {
    currentUserId = await window.electronAPI.getUserId();
  } else {
    console.error('Electron API not available');
    return;
  }
  
  let username = 'Player';
  if (window.electronAPI.loadUsername) {
    const savedUsername = await window.electronAPI.loadUsername();
    if (savedUsername) username = savedUsername;
  }
  
  await registerPlayer(username, currentUserId);
  
  await fetchPlayerStats();
  startAutoUpdate();
}

function setupPlayersCounter() {
  const counterElement = document.getElementById('playersOnlineCounter');
  if (!counterElement) {
    console.warn('Players counter element not found');
  }
}

async function fetchPlayerStats() {
  try {
    const response = await fetch(`${API_URL}/players/stats`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    updateCounterDisplay(data);
  } catch (error) {
    console.error('Error fetching player stats:', error);
    updateCounterDisplay({ online: 0, peak: 0 });
  }
}

function updateCounterDisplay(stats) {
  const counterElement = document.getElementById('playersOnlineCounter');
  const onlineCount = document.getElementById('onlineCount');

  if (onlineCount) {
    onlineCount.textContent = stats.online || 0;
  }

  if (counterElement) {
    counterElement.classList.add('updated');
    setTimeout(() => {
      counterElement.classList.remove('updated');
    }, 300);
  }
}

async function registerPlayer(username, userId) {
  try {
    const response = await fetch(`${API_URL}/players/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, userId })
    });

    if (!response.ok) {
      throw new Error(`Failed to register player: ${response.status}`);
    }

    const data = await response.json();
    currentUserId = userId;
    console.log('Player registered:', data);
    
    await fetchPlayerStats();
    
    return data;
  } catch (error) {
    console.error('Error registering player:', error);
    return null;
  }
}

async function unregisterPlayer(userId) {
  try {
    const response = await fetch(`${API_URL}/players/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      throw new Error(`Failed to unregister player: ${response.status}`);
    }

    const data = await response.json();
    currentUserId = null;
    console.log('Player unregistered:', data);
    
    await fetchPlayerStats();
    
    return data;
  } catch (error) {
    console.error('Error unregistering player:', error);
    return null;
  }
}

function startAutoUpdate() {
  updateInterval = setInterval(async () => {
    await fetchPlayerStats();
    
    if (currentUserId) {
      const username = window.LauncherState?.username || 'Player';
      await registerPlayer(username, currentUserId);
    }
  }, 3000);
}

function stopAutoUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}


window.addEventListener('beforeunload', () => {
  if (currentUserId) {
    const data = JSON.stringify({ userId: currentUserId });
    navigator.sendBeacon(`${API_URL}/players/unregister`, data);
  }
  stopAutoUpdate();
});

window.PlayersAPI = {
  register: registerPlayer,
  unregister: unregisterPlayer,
  fetchStats: fetchPlayerStats
};

document.addEventListener('DOMContentLoaded', initPlayersCounter);

const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const { PassThrough } = require('stream');

const PROXY_URL = process.env.HF2P_PROXY_URL || 'your_proxy_url_here';
const SECRET_KEY = process.env.HF2P_SECRET_KEY || 'your_secret_key_here_for_jwt';
const USE_DIRECT_FALLBACK = process.env.HF2P_USE_FALLBACK !== 'false';
const DIRECT_TIMEOUT = 7000; // 7 seconds timeout

console.log('[ProxyClient] Initialized with proxy URL:', PROXY_URL ? 'YES' : 'NO');
console.log('[ProxyClient] Secret key configured:', SECRET_KEY ? 'YES' : 'NO');
console.log('[ProxyClient] Direct connection fallback:', USE_DIRECT_FALLBACK ? 'ENABLED' : 'DISABLED');
console.log('[ProxyClient] Direct timeout before fallback:', DIRECT_TIMEOUT / 1000, 'seconds');

function generateToken() {
  const timestamp = Date.now().toString();
  const hash = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(timestamp)
    .digest('hex');
  const token = `${timestamp}:${hash}`;
  console.log('[ProxyClient] Generated auth token:', token.substring(0, 20) + '...');
  return token;
}

// Direct request without proxy
async function directRequest(url, options = {}) {
  console.log('[ProxyClient] Attempting direct request (no proxy)');
  console.log('[ProxyClient] Direct URL:', url);
  
  const timeoutMs = options.timeout || DIRECT_TIMEOUT;
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    console.warn('[ProxyClient] TIMEOUT! Aborting direct request after', timeoutMs, 'ms');
    controller.abort();
  }, timeoutMs);
  
  try {
    const config = {
      method: options.method || 'GET',
      url: url,
      headers: options.headers || {},
      timeout: timeoutMs,
      responseType: options.responseType,
      signal: controller.signal
    };
    
    const response = await axios(config);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Proxy request (original function)
async function proxyRequest(url, options = {}) {
  console.log('[ProxyClient] Starting proxy request');
  console.log('[ProxyClient] Original URL:', url);
  console.log('[ProxyClient] Options:', JSON.stringify(options, null, 2));
  
  try {
    const token = generateToken();
    const urlObj = new URL(url);
    const targetUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    console.log('[ProxyClient] Parsed URL components:');
    console.log('  - Protocol:', urlObj.protocol);
    console.log('  - Host:', urlObj.host);
    console.log('  - Pathname:', urlObj.pathname);
    console.log('  - Search:', urlObj.search);
    console.log('  - Target URL:', targetUrl);

    const proxyEndpoint = `${PROXY_URL}/proxy${urlObj.pathname}${urlObj.search}`;
    console.log('[ProxyClient] Proxy endpoint:', proxyEndpoint);

    const config = {
      method: options.method || 'GET',
      url: proxyEndpoint,
      headers: {
        'X-Auth-Token': token,
        'X-Target-URL': targetUrl,
        ...(options.headers || {})
      },
      timeout: options.timeout || 30000,
      responseType: options.responseType
    };

    console.log('[ProxyClient] Request config:', JSON.stringify({
      method: config.method,
      url: config.url,
      headers: config.headers,
      timeout: config.timeout,
      responseType: config.responseType
    }, null, 2));

    const response = await axios(config);
    console.log('[ProxyClient] Response received - Status:', response.status);
    console.log('[ProxyClient] Response headers:', JSON.stringify(response.headers, null, 2));
    
    return response;
  } catch (error) {
    console.error('[ProxyClient] Request failed!');
    console.error('[ProxyClient] Error type:', error.constructor.name);
    console.error('[ProxyClient] Error message:', error.message);
    if (error.response) {
      console.error('[ProxyClient] Response status:', error.response.status);
      console.error('[ProxyClient] Response data:', error.response.data);
      console.error('[ProxyClient] Response headers:', error.response.headers);
    }
    if (error.config) {
      console.error('[ProxyClient] Failed request URL:', error.config.url);
      console.error('[ProxyClient] Failed request headers:', error.config.headers);
    }
    throw error;
  }
}

// Smart request with automatic fallback
async function smartRequest(url, options = {}) {
  if (!USE_DIRECT_FALLBACK) {
    console.log('[ProxyClient] Fallback disabled, using proxy directly');
    return proxyRequest(url, options);
  }

  console.log('[ProxyClient] Smart request with fallback enabled');
  console.log('[ProxyClient] Direct timeout configured:', DIRECT_TIMEOUT, 'ms');
  
  const directStartTime = Date.now();
  try {
    console.log('[ProxyClient] [ATTEMPT 1/2] Trying direct connection first...');
    const response = await directRequest(url, options);
    const directDuration = Date.now() - directStartTime;
    console.log('[ProxyClient] [SUCCESS] Direct connection successful in', directDuration, 'ms');
    return response;
  } catch (directError) {
    const directDuration = Date.now() - directStartTime;
    console.warn('[ProxyClient] [FAILED] Direct connection failed after', directDuration, 'ms');
    console.warn('[ProxyClient] Error message:', directError.message);
    console.warn('[ProxyClient] Error code:', directError.code);
    
    // Always fallback to proxy on any error
    console.log('[ProxyClient] Attempting proxy fallback for all errors...');
    
    if (true) {
      console.log('[ProxyClient] [ATTEMPT 2/2] Falling back to proxy connection...');
      try {
        const proxyStartTime = Date.now();
        const response = await proxyRequest(url, options);
        const proxyDuration = Date.now() - proxyStartTime;
        console.log('[ProxyClient] [SUCCESS] Proxy connection successful in', proxyDuration, 'ms');
        return response;
      } catch (proxyError) {
        console.error('[ProxyClient] [FAILED] Both direct and proxy connections failed!');
        console.error('[ProxyClient] Direct error:', directError.message);
        console.error('[ProxyClient] Proxy error:', proxyError.message);
        throw proxyError;
      }
    } else {
      console.log('[ProxyClient] [SKIP] Direct error not related to connectivity, not falling back');
      throw directError;
    }
  }
}

// Direct download stream without proxy
function directDownloadStream(url, onData) {
  console.log('[ProxyClient] Starting direct download stream (no proxy)');
  console.log('[ProxyClient] Direct download URL:', url);
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : require('http');

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: DIRECT_TIMEOUT
      };

      const handleResponse = (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          console.log('[ProxyClient] Direct redirect to:', redirectUrl);
          directDownloadStream(redirectUrl, onData).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Direct HTTP ${response.statusCode}`));
          return;
        }

        if (onData) {
          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloaded = 0;
          const passThrough = new PassThrough();
          
          response.on('data', (chunk) => {
            downloaded += chunk.length;
            onData(chunk, downloaded, totalSize);
          });
          
          response.pipe(passThrough);
          resolve(passThrough);
        } else {
          resolve(response);
        }
      };

      const req = protocol.get(options, handleResponse);
      
      req.on('error', (error) => {
        console.error('[ProxyClient] Direct download error:', error.message);
        reject(error);
      });
      
      req.on('timeout', () => {
        console.warn('[ProxyClient] TIMEOUT! Direct download timed out after', DIRECT_TIMEOUT, 'ms');
        req.destroy();
        const timeoutError = new Error('ETIMEDOUT: Direct connection timeout');
        timeoutError.code = 'ETIMEDOUT';
        reject(timeoutError);
      });

        
    } catch (error) {
      reject(error);
    }
  });
}

function getProxyDownloadStream(url, onData) {
  console.log('[ProxyClient] Starting download stream');
  console.log('[ProxyClient] Download URL:', url);
  
  return new Promise((resolve, reject) => {
    try {
      const token = generateToken();
      const urlObj = new URL(url);
      const targetUrl = `${urlObj.protocol}//${urlObj.host}`;

      console.log('[ProxyClient] Download URL parsed:');
      console.log('  - Protocol:', urlObj.protocol);
      console.log('  - Host:', urlObj.host);
      console.log('  - Hostname:', urlObj.hostname);
      console.log('  - Port:', urlObj.port);
      console.log('  - Pathname:', urlObj.pathname);
      console.log('  - Search:', urlObj.search);
      console.log('  - Target URL:', targetUrl);

      const proxyUrl = new URL(PROXY_URL);
      const requestPath = `/proxy${urlObj.pathname}${urlObj.search}`;

      console.log('[ProxyClient] Proxy configuration:');
      console.log('  - Proxy URL:', PROXY_URL);
      console.log('  - Proxy protocol:', proxyUrl.protocol);
      console.log('  - Proxy hostname:', proxyUrl.hostname);
      console.log('  - Proxy port:', proxyUrl.port);
      console.log('  - Request path:', requestPath);

      const options = {
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
        path: requestPath,
        method: 'GET',
        headers: {
          'X-Auth-Token': token,
          'X-Target-URL': targetUrl
        }
      };

      console.log('[ProxyClient] HTTP request options:', JSON.stringify(options, null, 2));

      const protocol = proxyUrl.protocol === 'https:' ? https : require('http');
      console.log('[ProxyClient] Using protocol:', proxyUrl.protocol);

      const handleResponse = (response) => {
        console.log('[ProxyClient] Response received - Status:', response.statusCode);
        console.log('[ProxyClient] Response headers:', JSON.stringify(response.headers, null, 2));
        
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          console.log('[ProxyClient] Redirect detected to:', redirectUrl);
          
          if (redirectUrl.startsWith('http')) {
            console.log('[ProxyClient] Following redirect...');
            getProxyDownloadStream(redirectUrl, onData).then(resolve).catch(reject);
          } else {
            console.error('[ProxyClient] Invalid redirect URL:', redirectUrl);
            reject(new Error(`Invalid redirect: ${redirectUrl}`));
          }
          return;
        }

        if (response.statusCode !== 200) {
          console.error('[ProxyClient] Unexpected status code:', response.statusCode);
          console.error('[ProxyClient] Response message:', response.statusMessage);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        if (onData) {
          const totalSize = parseInt(response.headers['content-length'], 10);
          console.log('[ProxyClient] Download starting - Total size:', totalSize, 'bytes');
          
          let downloaded = 0;
          const passThrough = new PassThrough();
          
          response.on('data', (chunk) => {
            downloaded += chunk.length;
            const progress = ((downloaded / totalSize) * 100).toFixed(2);
            onData(chunk, downloaded, totalSize);
          });
          
          response.on('end', () => {
            console.log('[ProxyClient] Download completed -', downloaded, 'bytes received');
          });
          
          response.on('error', (error) => {
            console.error('[ProxyClient] Response stream error:', error.message);
          });
          
          response.pipe(passThrough);
          console.log('[ProxyClient] Stream piped to PassThrough');
          resolve(passThrough);
        } else {
          console.log('[ProxyClient] Returning raw response stream (no progress callback)');
          resolve(response);
        }
      };

      const request = protocol.get(options, handleResponse);
      
      request.on('error', (error) => {
        console.error('[ProxyClient] HTTP request error!');
        console.error('[ProxyClient] Error type:', error.constructor.name);
        console.error('[ProxyClient] Error message:', error.message);
        console.error('[ProxyClient] Error code:', error.code);
        console.error('[ProxyClient] Error stack:', error.stack);
        reject(error);
      });

      console.log('[ProxyClient] HTTP request sent');
      
    } catch (error) {
      console.error('[ProxyClient] Exception in getProxyDownloadStream!');
      console.error('[ProxyClient] Error type:', error.constructor.name);
      console.error('[ProxyClient] Error message:', error.message);
      console.error('[ProxyClient] Error stack:', error.stack);
      reject(error);
    }
  });
}

// Smart download stream with automatic fallback
function smartDownloadStream(url, onData) {
  if (!USE_DIRECT_FALLBACK) {
    console.log('[ProxyClient] Fallback disabled, using proxy stream directly');
    return getProxyDownloadStream(url, onData);
  }

  console.log('[ProxyClient] Smart download stream with fallback enabled');
  console.log('[ProxyClient] Direct timeout configured:', DIRECT_TIMEOUT, 'ms');
  
  return new Promise(async (resolve, reject) => {
    const directStartTime = Date.now();
    try {
      console.log('[ProxyClient] [DOWNLOAD 1/2] Trying direct download first...');
      const stream = await directDownloadStream(url, onData);
      const directDuration = Date.now() - directStartTime;
      console.log('[ProxyClient] [SUCCESS] Direct download stream established in', directDuration, 'ms');
      resolve(stream);
    } catch (directError) {
      const directDuration = Date.now() - directStartTime;
      console.warn('[ProxyClient] [FAILED] Direct download failed after', directDuration, 'ms');
      console.warn('[ProxyClient] Error message:', directError.message);
      console.warn('[ProxyClient] Error code:', directError.code);
      
      // Always fallback to proxy on any error
      console.log('[ProxyClient] Attempting proxy fallback for all download errors...');
      
      if (true) {
        console.log('[ProxyClient] [DOWNLOAD 2/2] Falling back to proxy download...');
        try {
          const proxyStartTime = Date.now();
          const stream = await getProxyDownloadStream(url, onData);
          const proxyDuration = Date.now() - proxyStartTime;
          console.log('[ProxyClient] [SUCCESS] Proxy download stream established in', proxyDuration, 'ms');
          resolve(stream);
        } catch (proxyError) {
          console.error('[ProxyClient] [FAILED] Both direct and proxy downloads failed!');
          console.error('[ProxyClient] Direct error:', directError.message);
          console.error('[ProxyClient] Proxy error:', proxyError.message);
          reject(proxyError);
        }
      } else {
        console.log('[ProxyClient] [SKIP] Direct error not related to connectivity, not falling back');
        reject(directError);
      }
    }
  });
}
    
module.exports = {
  // Recommended: Smart functions with automatic fallback
  smartRequest,
  smartDownloadStream,
  
  // Legacy: Direct proxy functions (for manual control)
  proxyRequest,
  getProxyDownloadStream,
  
  // Direct functions (no proxy)
  directRequest,
  directDownloadStream,
  
  // Utilities
  generateToken
};

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Automatic stall retry constants
const MAX_AUTOMATIC_STALL_RETRIES = 3;
const AUTOMATIC_STALL_RETRY_DELAY = 3000; // 3 seconds in milliseconds

// Network monitoring utilities using Node.js built-in methods
function checkNetworkConnection() {
  return new Promise((resolve) => {
    const { lookup } = require('dns');
    const http = require('http');
    
    // Try DNS lookup first (faster) - using callback version
    lookup('8.8.8.8', (err) => {
      if (err) {
        resolve(false);
        return;
      }
      
      // Try HTTP request to confirm internet connectivity
      const req = http.get('http://www.google.com', { timeout: 3000 }, (res) => {
        resolve(true);
        res.destroy();
      });
      
      req.on('error', () => {
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  });
}



async function downloadFile(url, dest, progressCallback, maxRetries = 5) {
  let lastError = null;
  let retryState = {
    attempts: 0,
    maxRetries: maxRetries,
    canRetry: true,
    lastError: null,
    automaticStallRetries: 0,
    isAutomaticRetry: false
  };
  let downloadStalled = false;
  let streamCompleted = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      retryState.attempts = attempt + 1;
      console.log(`Download attempt ${attempt + 1}/${maxRetries} for ${url}`);

      if (attempt > 0 && progressCallback) {
        // Exponential backoff with jitter - longer delays for unstable connections
        const baseDelay = 3000;
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 2000;
        const delay = Math.min(exponentialDelay + jitter, 60000);
        
        progressCallback(`Retry ${attempt}/${maxRetries - 1}...`, null, null, null, null, retryState);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Create AbortController for proper stream control
      const controller = new AbortController();
      let hasReceivedData = false;
      let lastProgressTime = Date.now(); // Initialize before timeout
      
      // Smart overall timeout - only trigger if no progress for extended period
      const overallTimeout = setInterval(() => {
        const now = Date.now();
        const timeSinceLastProgress = now - lastProgressTime;
        
        // Only timeout if no data received for 15 minutes (900 seconds) - for very slow connections
        if (timeSinceLastProgress > 900000 && hasReceivedData) {
          console.log('Download stalled for 15 minutes, aborting...');
          console.log(`Download had progress before stall: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
          controller.abort();
        }
      }, 60000); // Check every minute

      // Check if we can resume existing download
      let startByte = 0;
      if (fs.existsSync(dest)) {
        const existingStats = fs.statSync(dest);
        
        // If file size matches remote size, skip download
        if (existingStats.size == fs.statSync(dest).size) {
          console.log('File already exists and is complete. Skipping download.');
          return { success: true, downloaded: existingStats.size };
        }

        // Only resume if file exists and is substantial (> 1MB)
        if (existingStats.size > 1024 * 1024) {
          startByte = existingStats.size;
          console.log(`Resuming download from byte ${startByte} (${(existingStats.size / 1024 / 1024).toFixed(2)} MB already downloaded)`);
        } else {
          // File too small, start fresh
          fs.unlinkSync(dest);
          console.log('Existing file too small, starting fresh download');
        }
      }

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*'
      };
      
      // Add Range header ONLY if resuming (startByte > 0)
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
        console.log(`Adding Range header: bytes=${startByte}-`);
      } else {
        console.log('Fresh download, no Range header');
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 120000, // 120 seconds for slow connections
        signal: controller.signal,
        headers: headers,
        validateStatus: function (status) {
          return (status >= 200 && status < 300) || status === 206;
        },
        maxRedirects: 5,
        family: 4
      });

      const contentLength = response.headers['content-length'];
      const totalSize = contentLength ? parseInt(contentLength, 10) + startByte : 0;
      let downloaded = startByte;
      lastProgressTime = Date.now();
      const startTime = Date.now();

      // Check network status before attempting download, in case of known offline state
      try {
        const isNetworkOnline = await checkNetworkConnection();
        if (!isNetworkOnline) {
          throw new Error('Network connection unavailable. Please check your connection and retry.');
        }
      } catch (networkError) {
        console.error('[Network] Network check failed, proceeding anyway:', networkError.message);
        // Continue with download attempt - network check failure shouldn't block
      }

      const writer = fs.createWriteStream(dest, { 
        flags: startByte > 0 ? 'a' : 'w', // 'a' for append (resume), 'w' for write (fresh)
        start: startByte > 0 ? startByte : 0
      });
      let streamError = null;
      let stalledTimeout = null;
      
      // Reset state for this attempt
      downloadStalled = false;
      streamCompleted = false;

      // Enhanced stream event handling
      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        hasReceivedData = true; // Mark that we've received data

        // Reset simple stall timer on data received
        if (stalledTimeout) {
          clearTimeout(stalledTimeout);
        }

        // Set new stall timer (30 seconds without data = stalled)
        stalledTimeout = setTimeout(async () => {
          console.log('Download stalled - checking network connectivity...');
          
          // Check if network is actually available before retrying
          try {
            const isNetworkOnline = await checkNetworkConnection();
            if (!isNetworkOnline) {
              console.log('Network connection lost - stopping download and showing error');
              downloadStalled = true;
              streamError = new Error('Network connection lost. Please check your internet connection and retry.');
              streamError.isConnectionLost = true;
              streamError.canRetry = false;
              controller.abort();
              writer.destroy();
              response.data.destroy();
              // Immediately reject the promise to prevent hanging
              setTimeout(() => promiseReject(streamError), 100);
              return;
            }
          } catch (networkError) {
            console.error('Network check failed during stall detection:', networkError.message);
          }
          
          console.log('Network available - download stalled due to slow connection, aborting for retry...');
          downloadStalled = true;
          streamError = new Error('Download stalled due to slow network connection. Please retry.');
          controller.abort();
          writer.destroy();
          response.data.destroy();
          // Immediately reject the promise to prevent hanging
          setTimeout(() => promiseReject(streamError), 100);
        }, 30000);

        if (progressCallback && totalSize > 0 && (now - lastProgressTime > 100)) { // Update every 100ms max
          const percent = Math.min(100, Math.max(0, (downloaded / totalSize) * 100));
          const elapsed = (now - startTime) / 1000;
          const speed = elapsed > 0 ? downloaded / elapsed : 0;
          
          progressCallback(null, percent, speed, downloaded, totalSize, retryState);
          lastProgressTime = now;
        }
      });

      // Enhanced stream error handling
      response.data.on('error', (error) => {
        // Ignore errors if it was intentionally cancelled or already handled
        if (downloadStalled || streamCompleted || controller.signal.aborted) {
          console.log(`Ignoring stream error after cancellation: ${error.code || error.message}`);
          return;
        }
        
        if (!streamError) {
          streamError = new Error(`Stream error: ${error.code || error.message}. Please retry.`);
          // Check for connection lost indicators
          if (error.code === 'ERR_NETWORK_CHANGED' || 
              error.code === 'ERR_INTERNET_DISCONNECTED' ||
              error.code === 'ERR_CONNECTION_LOST') {
            streamError.isConnectionLost = true;
            streamError.canRetry = false;
          }
          console.error(`Stream error on attempt ${attempt + 1}:`, error.code || error.message);
        }
        if (stalledTimeout) {
          clearTimeout(stalledTimeout);
        }
        if (overallTimeout) {
          clearInterval(overallTimeout);
        }
        writer.destroy();
      });

      response.data.on('close', () => {
        // Only treat as error if not already handled by cancellation and writer didn't complete
        if (!streamError && !streamCompleted && !downloadStalled && !controller.signal.aborted) {
          // Check if writer actually completed but stream close came first
          setTimeout(() => {
            if (!streamCompleted) {
              streamError = new Error('Stream closed unexpectedly. Please retry.');
              console.log('Stream closed unexpectedly on attempt', attempt + 1);
            }
          }, 500); // Small delay to check if writer completes
        }
        if (stalledTimeout) {
          clearTimeout(stalledTimeout);
        }
        if (overallTimeout) {
          clearInterval(overallTimeout);
        }
      });

      response.data.on('abort', () => {
        // Only treat as error if not already handled by stall detection
        if (!streamError && !streamCompleted && !downloadStalled) {
          streamError = new Error('Download aborted due to network issue. Please retry.');
          console.log('Stream aborted on attempt', attempt + 1);
        }
        if (stalledTimeout) {
          clearTimeout(stalledTimeout);
        }
      });

      response.data.pipe(writer);

      let promiseReject = null;
      await new Promise((resolve, reject) => {
        // Store promise reject function for immediate use by stall timeout
        promiseReject = reject;
        writer.on('finish', () => {
          streamCompleted = true;
          console.log(`Writer finished on attempt ${attempt + 1}, downloaded: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
          
          // Clear ALL timeouts to prevent them from firing after completion
          if (stalledTimeout) {
            clearTimeout(stalledTimeout);
            console.log('Cleared stall timeout after writer finished');
          }
          if (overallTimeout) {
            clearInterval(overallTimeout);
            console.log('Cleared overall timeout after writer finished');
          }
          
          // Download is successful if writer finished - regardless of stream state
          if (!downloadStalled) {
            console.log(`Download completed successfully on attempt ${attempt + 1}`);
            resolve();
          } else {
            // Don't reject here if we already rejected due to network loss - prevents duplicate rejection
            console.log('Writer finished after stall detection, ignoring...');
          }
        });

        writer.on('error', (error) => {
          // Ignore write errors if stream was intentionally cancelled
          if (downloadStalled || controller.signal.aborted) {
            console.log(`Ignoring writer error after cancellation: ${error.code || error.message}`);
            return;
          }
          
          if (!streamError) {
            streamError = new Error(`File write error: ${error.code || error.message}. Please retry.`);
            console.error(`Writer error on attempt ${attempt + 1}:`, error.code || error.message);
          }
          if (stalledTimeout) {
            clearTimeout(stalledTimeout);
          }
          if (overallTimeout) {
            clearInterval(overallTimeout);
          }
          reject(streamError);
        });

        // Handle case where stream ends without finishing writer
        response.data.on('end', () => {
          if (!streamCompleted && !downloadStalled && !streamError) {
            // Give a small delay for writer to finish - this is normal behavior
            setTimeout(() => {
              if (!streamCompleted) {
                console.log('Stream ended but writer not finished - waiting longer...');
                // Give more time for writer to finish - this might be slow disk I/O
                setTimeout(() => {
                  if (!streamCompleted) {
                    streamError = new Error('Download incomplete. Please retry.');
                    reject(streamError);
                  }
                }, 2000);
              }
            }, 1000);
          }
        });
      });

      return dest;

  } catch (error) {
    lastError = error;
    retryState.lastError = error;
    console.error(`Download attempt ${attempt + 1} failed:`, error.code || error.message);
    console.error(`Error details:`, { 
      isConnectionLost: error.isConnectionLost, 
      canRetry: error.canRetry,
      message: error.message,
      downloadStalled: downloadStalled,
      streamCompleted: streamCompleted
    });
    
    // Check if download actually completed successfully despite the error
    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      const sizeInMB = stats.size / 1024 / 1024;
      console.log(`File size after error: ${sizeInMB.toFixed(2)} MB`);
      
      // If file is substantial size (> 1.5GB), treat as success and break
      if (sizeInMB >= 1500) {
        console.log('File appears to be complete despite error, treating as success');
        return dest; // Exit the retry loop successfully
      }
    }

    // Enhanced file cleanup with validation
    if (fs.existsSync(dest)) {
      try {
        // HTTP 416 = Range Not Satisfiable, delete corrupted partial file
        const isRangeError = error.message && error.message.includes('416');
        
        // Check if file is corrupted (small or invalid) or if error is non-resumable
        const partialStats = fs.statSync(dest);
        const isResumableError = error.message && (
          error.message.includes('stalled') ||
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('aborted')
        );
        
        // Check if download appears to be complete (close to expected PWR size)
        const isPossiblyComplete = partialStats.size >= 1500 * 1024 * 1024; // >= 1.5GB
        
        if (isRangeError || partialStats.size < 1024 * 1024 || (!isResumableError && !isPossiblyComplete)) {
          // Delete if HTTP 416 OR file is too small OR error is non-resumable AND not possibly complete
          const reason = isRangeError ? 'HTTP 416 range error' : (!isResumableError && !isPossiblyComplete ? 'non-resumable error' : 'too small');
          console.log(`[Cleanup] Removing file (${reason}): ${(partialStats.size / 1024 / 1024).toFixed(2)} MB`);
          fs.unlinkSync(dest);
        } else {
          // Keep the file for resume on resumable errors or if possibly complete
          console.log(`[Resume] Keeping file (${isPossiblyComplete ? 'possibly complete' : 'for resume'}): ${(partialStats.size / 1024 / 1024).toFixed(2)} MB`);
        }
      } catch (cleanupError) {
        console.warn('Could not handle partial file:', cleanupError.message);
      }
    }

    // Expanded retryable error codes for better network detection
    const retryableErrors = [
      'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 
      'ESOCKETTIMEDOUT', 'EPROTO', 'ENETDOWN', 'EHOSTUNREACH',
      'ECONNABORTED', 'EPIPE', 'ENETRESET', 'EADDRNOTAVAIL',
      'ERR_NETWORK', 'ERR_INTERNET_DISCONNECTED', 'ERR_CONNECTION_RESET',
      'ERR_CONNECTION_TIMED_OUT', 'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_CLOSED'
    ];
    
    const isRetryable = retryableErrors.includes(error.code) ||
      error.message.includes('timeout') ||
      error.message.includes('stalled') ||
      error.message.includes('aborted') ||
      error.message.includes('network') ||
      error.message.includes('connection') ||
      error.message.includes('Please retry') ||
      error.message.includes('corrupted') ||
      error.message.includes('invalid') ||
      (error.response && error.response.status >= 500);

    // Respect error's canRetry property if set
    const canRetry = (error.canRetry === false) ? false : isRetryable;

    if (!canRetry || attempt === maxRetries - 1) {
      // Don't set retryState.canRetry to false for max retries - user should still be able to retry manually
      retryState.canRetry = error.canRetry === false ? false : true;
      console.error(`Non-retryable error or max retries reached: ${error.code || error.message}`);
      break;
    }

    console.log(`Retryable error detected, will retry...`);
    }
  }

  // Enhanced error with retry state and user-friendly message
  const detailedError = lastError?.code || lastError?.message || 'Unknown error';
  const errorMessage = `Download failed after ${maxRetries} attempts. Last error: ${detailedError}. Please retry`;
  const enhancedError = new Error(errorMessage);
  enhancedError.retryState = retryState;
  enhancedError.lastError = lastError;
  enhancedError.detailedError = detailedError;
  
  // Allow manual retry unless it's a connection lost error
  enhancedError.canRetry = !lastError?.isConnectionLost && lastError?.canRetry !== false;
  throw enhancedError;
}

function findHomePageUIPath(gameLatest) {
  function searchDirectory(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.isFile() && item.name === 'HomePage.ui') {
          return path.join(dir, item.name);
        } else if (item.isDirectory()) {
          const found = searchDirectory(path.join(dir, item.name));
          if (found) {
            return found;
          }
        }
      }
    } catch (error) {
    }

    return null;
  }

  if (!fs.existsSync(gameLatest)) {
    return null;
  }

  return searchDirectory(gameLatest);
}

function findLogoPath(gameLatest) {
  function searchDirectory(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.isFile() && item.name === 'Logo@2x.png') {
          return path.join(dir, item.name);
        } else if (item.isDirectory()) {
          const found = searchDirectory(path.join(dir, item.name));
          if (found) {
            return found;
          }
        }
      }
    } catch (error) {
    }

    return null;
  }

  if (!fs.existsSync(gameLatest)) {
    return null;
  }

  return searchDirectory(gameLatest);
}

// Automatic stall retry function for network stalls
async function retryStalledDownload(url, dest, progressCallback, previousError = null) {
  console.log('Automatic stall retry initiated for:', url);
  
  // Wait before retry to allow network recovery
  console.log(`Waiting ${AUTOMATIC_STALL_RETRY_DELAY/1000} seconds before automatic retry...`);
  await new Promise(resolve => setTimeout(resolve, AUTOMATIC_STALL_RETRY_DELAY));
  
  try {
    // Create new retryState for automatic retry
    const automaticRetryState = {
      attempts: 1,
      maxRetries: 1,
      canRetry: true,
      lastError: null,
      automaticStallRetries: (previousError && previousError.retryState) ? previousError.retryState.automaticStallRetries + 1 : 1,
      isAutomaticRetry: true
    };
    
    // Update progress callback with automatic retry info
    if (progressCallback) {
      progressCallback(
        `Automatic stall retry ${automaticRetryState.automaticStallRetries}/${MAX_AUTOMATIC_STALL_RETRIES}...`,
        null, null, null, null, automaticRetryState
      );
    }
    
    await downloadFile(url, dest, progressCallback, 1);
    console.log('Automatic stall retry successful');
  } catch (error) {
    console.error('Automatic stall retry failed:', error.message);
    throw error;
  }
}

// Manual retry function for user-initiated retries
async function retryDownload(url, dest, progressCallback, previousError = null) {
  console.log('Manual retry initiated for:', url);
  
  // If we have a previous error with retry state, continue from there
  let additionalRetries = 3; // Allow 3 additional manual retries
  if (previousError && previousError.retryState) {
    additionalRetries = Math.max(2, 5 - previousError.retryState.attempts);
  }
  
  // Ensure cache directory exists before retrying
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    console.log('Creating cache directory:', destDir);
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // CRITICAL: Delete partial file before manual retry to avoid HTTP 416
  if (fs.existsSync(dest)) {
    try {
      const stats = fs.statSync(dest);
      console.log(`[Retry] Deleting partial file before retry: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      fs.unlinkSync(dest);
    } catch (err) {
      console.warn('Could not delete partial file:', err.message);
    }
  }
  
  try {
    await downloadFile(url, dest, progressCallback, additionalRetries);
    console.log('Manual retry successful');
  } catch (error) {
    console.error('Manual retry failed:', error.message);
    throw error;
  }
}

module.exports = {
  downloadFile,
  retryDownload,
  retryStalledDownload,
  findHomePageUIPath,
  findLogoPath
};

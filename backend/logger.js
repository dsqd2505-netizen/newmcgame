const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = null;
    this.logFile = null;
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5; 
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    this.initializeLogDirectory();
  }

  getAppDir() {
    const home = os.homedir();
    if (process.platform === 'win32') {
      return path.join(home, 'AppData', 'Local', 'HytaleF2P');
    } else if (process.platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'HytaleF2P');
    } else {
      return path.join(home, '.hytalef2p');
    }
  }

  getInstallPath() {
    try {
      const configFile = path.join(this.getAppDir(), 'config.json');
      if (fs.existsSync(configFile)) {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.installPath && config.installPath.trim()) {
          return path.join(config.installPath.trim(), 'HytaleF2P');
        }
      }
    } catch (err) {
    }
    return this.getAppDir();
  }

  initializeLogDirectory() {
    try {
      const installPath = this.getInstallPath();
      this.logDir = path.join(installPath, 'logs');
      
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeString = today.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
      this.logFile = path.join(this.logDir, `launcher-${dateString}-${timeString}.log`);
      
      this.writeToFile(`\n=== NEW LAUNCHER SESSION - ${today.toISOString()} ===\n`);
      
    } catch (error) {
      this.logDir = path.join(os.tmpdir(), 'HytaleF2P-logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      const timeString = today.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
      this.logFile = path.join(this.logDir, `launcher-${dateString}-${timeString}.log`);
      this.writeToFile(`\n=== FALLBACK SESSION IN TEMP - ${today.toISOString()} ===\n`);
    }
  }

  writeToFile(message) {
    if (!this.logFile) return;
    
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          this.rotateLogFile();
        }
      }
      
      fs.appendFileSync(this.logFile, message, 'utf8');
    } catch (error) {
      this.originalConsole.error('Unable to write to log file:', error.message);
    }
  }

  rotateLogFile() {
    try {
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      const timeString = today.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
      
      const rotatedFile = path.join(this.logDir, `launcher-${dateString}-${timeString}.log`);
      fs.renameSync(this.logFile, rotatedFile);
      
      this.cleanupOldLogs();
      
      const newToday = new Date();
      const newDateString = newToday.toISOString().split('T')[0];
      const newTimeString = newToday.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
      this.logFile = path.join(this.logDir, `launcher-${newDateString}-${newTimeString}.log`);
      this.writeToFile(`\n=== LOG ROTATION - ${newToday.toISOString()} ===\n`);
      
    } catch (error) {
      this.originalConsole.error('Erreur lors de la rotation des logs:', error.message);
    }
  }

  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('launcher-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); 

      if (files.length > this.maxLogFiles) {
        const filesToDelete = files.slice(this.maxLogFiles);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            this.originalConsole.error(`Impossible de supprimer le fichier de log ${file.name}:`, err.message);
          }
        });
      }
    } catch (error) {
      this.originalConsole.error('Erreur lors du nettoyage des logs:', error.message);
    }
  }

  formatLogMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  }

  log(...args) {
    const logMessage = this.formatLogMessage('info', ...args);
    this.writeToFile(logMessage);
    this.originalConsole.log(...args);
  }

  error(...args) {
    const logMessage = this.formatLogMessage('error', ...args);
    this.writeToFile(logMessage);
    this.originalConsole.error(...args);
  }

  warn(...args) {
    const logMessage = this.formatLogMessage('warn', ...args);
    this.writeToFile(logMessage);
    this.originalConsole.warn(...args);
  }

  info(...args) {
    const logMessage = this.formatLogMessage('info', ...args);
    this.writeToFile(logMessage);
    this.originalConsole.info(...args);
  }

  interceptConsole() {
    console.log = (...args) => this.log(...args);
    console.error = (...args) => this.error(...args);
    console.warn = (...args) => this.warn(...args);
    console.info = (...args) => this.info(...args);
    
    process.on('uncaughtException', (error) => {
      this.error('Uncaught exception:', error.stack || error.message);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled rejection at', promise, 'reason:', reason);
    });
  }

  restoreConsole() {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }

  getLogDirectory() {
    return this.logDir;
  }

  updateInstallPath() {
    this.initializeLogDirectory();
  }
}

const logger = new Logger();

module.exports = logger;
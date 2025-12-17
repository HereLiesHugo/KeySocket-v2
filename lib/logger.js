const fs = require('fs');
const path = require('path');

// Enhanced logging system
const logFile = path.join(__dirname, '..', 'server.log');
const logLevel = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

function writeLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}\n`;

  // Write to file
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }

  // Console output with colors
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };

  const levelColors = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.cyan,
    debug: colors.blue
  };

  const color = levelColors[level] || colors.reset;
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

// Enhanced logging functions
const logger = {
  error: (message, meta) => writeLog('error', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  info: (message, meta) => writeLog('info', message, meta),
  debug: (message, meta) => {
    if (logLevel === 'debug') writeLog('debug', message, meta);
  }
};

module.exports = logger;

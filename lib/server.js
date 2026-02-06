/**
 * Server module
 * Handles HTTP/HTTPS server creation and lifecycle management
 */

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { logger, logFile, logLevel } = require('./logging');
const config = require('./config');

/**
 * Create HTTP or HTTPS server based on configuration
 * @param {Object} app - Express application
 * @returns {Object} HTTP or HTTPS server instance
 */
function createServer(app) {
  if (config.USE_TLS && fs.existsSync(config.TLS_KEY) && fs.existsSync(config.TLS_CERT)) {
    const key = fs.readFileSync(config.TLS_KEY);
    const cert = fs.readFileSync(config.TLS_CERT);
    logger.info('Starting HTTPS server with TLS certificates', {
      key_path: config.TLS_KEY,
      cert_path: config.TLS_CERT
    });
    return https.createServer({ key, cert }, app);
  } else if (config.USE_TLS) {
    // TLS requested but certificates not found
    if (config.REQUIRE_TLS) {
      logger.error('TLS required but certificate files not found', {
        tls_key: config.TLS_KEY,
        tls_cert: config.TLS_CERT,
        require_tls: config.REQUIRE_TLS
      });
      throw new Error('TLS certificates required but not found');
    } else {
      logger.warn('TLS requested but certificates not found, falling back to HTTP', {
        tls_key: config.TLS_KEY,
        tls_cert: config.TLS_CERT
      });
      return http.createServer(app);
    }
  } else {
    // HTTP explicitly requested
    if (config.REQUIRE_TLS) {
      logger.error('TLS required but USE_TLS is false');
      throw new Error('TLS required but USE_TLS is disabled');
    }
    logger.info('Starting HTTP server (TLS disabled)');
    return http.createServer(app);
  }
}

/**
 * Start server and listen
 * @param {Object} server - HTTP/HTTPS server instance
 * @param {Function} callback - Callback when server is listening
 */
function startServer(server, callback) {
  server.listen(config.PORT, config.HOST, () => {
    logger.info('=== KeySocket Server Started Successfully ===', {
      host: config.HOST,
      port: config.PORT,
      environment: config.NODE_ENV,
      pid: process.pid,
      node_version: process.version,
      session_store_type: 'FileStore',
      websocket_path: '/ssh',
      ssrf_protection: 'enabled (DNS Resolution + IP Validation)',
      session_cleanup: 'enabled (24h TTL)',
      log_level: logLevel
    });

    console.log(`\n🚀 KeySocket Server listening on ${config.HOST}:${config.PORT}`);
    console.log(`📝 Logs: ${logFile}`);
    console.log(`🔐 Authentication: Google OAuth + Turnstile`);
    console.log(`🛡️  SSRF Protection: Enabled (DNS Resolution + IP Validation)`);
    console.log(`💾 Session Storage: FileStore`);
    console.log(`🗑️  Session Cleanup: Every 6 hours (24h TTL)\n`);

    if (callback) callback();
  });
}

/**
 * Gracefully shutdown server and all connections
 * @param {Object} server - HTTP/HTTPS server instance
 * @param {Object} wss - WebSocket server instance
 * @param {string} signal - Signal that triggered shutdown
 */
function gracefulShutdown(server, wss, signal) {
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });
  } catch (e) {
    logger.warn('Error closing server', { error: e.message });
  }

  try {
    // Close WebSocket server and all clients
    const clientCount = wss.clients.size;
    logger.info('Closing WebSocket clients', { client_count: clientCount });

    wss.clients.forEach((ws) => {
      try {
        // First close SSH connections cleanly
        if (ws._sshStream && typeof ws._sshStream.end === 'function') {
          try {
            ws._sshStream.end();
            logger.debug('SSH stream ended for client');
          } catch (e) {
            logger.debug('Error ending SSH stream', { error: e.message });
          }
        }

        if (ws._sshClient && typeof ws._sshClient.end === 'function') {
          try {
            ws._sshClient.end();
            logger.debug('SSH client ended for client');
          } catch (e) {
            logger.debug('Error ending SSH client', { error: e.message });
          }
        }

        // Close WebSocket with proper shutdown code
        try {
          ws.close(1001, 'Server shutdown');
          logger.debug('WebSocket closed with code 1001');
        } catch (e) {
          logger.debug('Error closing WebSocket, trying terminate', { error: e.message });
          try {
            ws.terminate();
          } catch (error_) {
            logger.debug('Error terminating WebSocket', { error: error_.message });
          }
        }
      } catch (e) {
        logger.debug('Error during client shutdown', { error: e.message });
      }
    });

    // Close the WebSocket server itself
    try {
      wss.close(() => {
        logger.info('WebSocket server closed');
      });
    } catch (e) {
      logger.warn('Error closing wss', { error: e.message });
    }
  } catch (e) {
    logger.warn('Error during websocket shutdown', { error: e.message });
  }

  // Give a short grace period then exit
  setTimeout(() => {
    logger.info('Shutdown complete, exiting');
    process.exit(0);
  }, 3000);
}

/**
 * Setup process signal handlers for graceful shutdown
 * @param {Object} server - HTTP/HTTPS server instance
 * @param {Object} wss - WebSocket server instance
 */
function setupSignalHandlers(server, wss) {
  process.on('SIGINT', () => gracefulShutdown(server, wss, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(server, wss, 'SIGTERM'));
}

module.exports = {
  createServer,
  startServer,
  gracefulShutdown,
  setupSignalHandlers
};

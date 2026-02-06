/**
 * KeySocket Server - Main Entry Point
 * A secure web-based SSH gateway with SSRF protection and Turnstile verification
 */

require('dotenv').config();
const express = require('express');

// Import all modules
const { logger } = require('./lib/logging');
const config = require('./lib/config');
const { initializePassport, passport } = require('./lib/auth');
const {
  createSessionMiddleware,
  startPeriodicCleanup,
  sessionStore
} = require('./lib/session');
const { setupAllMiddleware } = require('./lib/middleware');
const { registerRoutes } = require('./lib/routes');
const { createWebSocketServer } = require('./lib/websocket');
const { createServer, startServer, setupSignalHandlers } = require('./lib/server');

// Log server startup
logger.info('=== KeySocket Server Starting ===', {
  node_version: process.version,
  platform: process.platform,
  env: config.NODE_ENV
});

// Create Express app
const app = express();

// Initialize Passport authentication
initializePassport();

// Create session middleware
const sessionMiddleware = createSessionMiddleware();

// Setup all middleware (security, parsing, auth, logging, static files)
setupAllMiddleware(app, sessionMiddleware, passport);

// Register all routes
registerRoutes(app, passport);

// Create HTTP/HTTPS server
const server = createServer(app);

// Create WebSocket server
const wss = createWebSocketServer(server);

// Start session cleanup
startPeriodicCleanup();

// Start listening
startServer(server, () => {
  // Setup signal handlers for graceful shutdown
  setupSignalHandlers(server, wss);
});

// Export for testing if needed
module.exports = { app, server, wss };

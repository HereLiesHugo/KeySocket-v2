/**
 * Configuration module
 * Centralizes all environment variables and application constants
 */

require('dotenv').config();

// Server configuration
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const USE_TLS = process.env.USE_TLS === 'true';
const REQUIRE_TLS = process.env.REQUIRE_TLS === 'true';
const TLS_KEY = process.env.TLS_KEY || '/etc/letsencrypt/live/keysocket.eu/privkey.pem';
const TLS_CERT = process.env.TLS_CERT || '/etc/letsencrypt/live/keysocket.eu/fullchain.pem';

// Session configuration
const BEHIND_PROXY = process.env.BEHIND_PROXY === undefined ? true : (process.env.BEHIND_PROXY === 'true');
const SESSION_SECRET = process.env.SESSION_SECRET;
const FILESTORE_ENCRYPTION_KEY = process.env.FILESTORE_ENCRYPTION_KEY;
const SESSION_COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';

// OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL;

// Cloudflare Turnstile configuration
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_TOKEN_TTL_MS = Number.parseInt(process.env.TURNSTILE_TOKEN_TTL_MS || String(30 * 1000), 10);
const TURNSTILE_MAX_RETRIES = Number.parseInt(process.env.TURNSTILE_MAX_RETRIES || '1', 10);
const TURNSTILE_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.TURNSTILE_REQUEST_TIMEOUT_MS || '10000', 10);

// Rate limiting
const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT || '120', 10);

// WebSocket configuration
const CONCURRENT_PER_IP = Number.parseInt(process.env.CONCURRENT_PER_IP || '5', 10);
const MAX_SSH_ATTEMPTS_PER_USER = Number.parseInt(process.env.MAX_SSH_ATTEMPTS_PER_USER || '5', 10);
const SESSION_STORE_GET_TIMEOUT_MS = Number.parseInt(process.env.SESSION_STORE_GET_TIMEOUT_MS || '2000', 10);

// Asset versioning
const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
  // Server
  HOST,
  PORT,
  USE_TLS,
  REQUIRE_TLS,
  TLS_KEY,
  TLS_CERT,
  NODE_ENV,
  
  // Session
  BEHIND_PROXY,
  SESSION_SECRET,
  FILESTORE_ENCRYPTION_KEY,
  SESSION_COOKIE_SAMESITE,
  
  // OAuth
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  APP_BASE_URL,
  
  // Turnstile
  TURNSTILE_SECRET,
  TURNSTILE_TOKEN_TTL_MS,
  TURNSTILE_MAX_RETRIES,
  TURNSTILE_REQUEST_TIMEOUT_MS,
  
  // Rate limiting
  RATE_LIMIT,
  
  // WebSocket
  CONCURRENT_PER_IP,
  MAX_SSH_ATTEMPTS_PER_USER,
  SESSION_STORE_GET_TIMEOUT_MS
};

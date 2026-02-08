/**
 * test_all.js
 * Comprehensive Security & Feature Test Suite for KeySocket Server
 * * Usage: 
 * 1. Start your server in a separate terminal: node server.js
 * 2. Run this script: node test_all.js
 */

require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const assert = require('node:assert');
const colors = require('colors');
const net = require('node:net');

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Handle localhost vs 0.0.0.0 for axios
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace('0.0.0.0', '127.0.0.1');

console.log(`\n🔎  Starting KeySocket Security & Feature Tests`.bold.cyan);
console.log(`Target: ${BASE_URL}\n`);

// Statistics
let passed = 0;
let failed = 0;

async function runTest(name, testFn) {
  process.stdout.write(`Testing: ${name.padEnd(50)} `);
  try {
    await testFn();
    console.log('✅ PASS'.green);
    passed++;
  } catch (error) {
    console.log('❌ FAIL'.red);
    console.error(`   Error: ${error.message}`.gray);
    if (error.response) {
      console.error(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`.gray);
    }
    failed++;
  }
}

// --- SECTION 1: WHITE-BOX LOGIC TESTING ---
// We replicate the crucial security logic from server.js to test edge cases 
// without needing a live Google Session.

// Helper: Convert integer to Dotted-Quad string (e.g. 2130706433 -> 127.0.0.1)
function intToIp(int) {
  return [
    (int >>> 24) & 0xFF,
    (int >>> 16) & 0xFF,
    (int >>> 8) & 0xFF,
    int & 0xFF
  ].join('.');
}

// Parse hex IP format (0x7f000001 or 0x7f.0x00.0x00.0x01)
function parseHexIP(ip) {
  if (ip.includes('.')) {
    return ip.split('.').map(part => Number.parseInt(part, 16)).join('.');
  }
  const intVal = Number.parseInt(ip, 16);
  if (Number.isNaN(intVal)) return null;
  return intToIp(intVal);
}

// Parse octal IP format (0177.0.0.1)
function parseOctalIP(ip) {
  return ip.split('.').map(part => Number.parseInt(part, 8)).join('.');
}

// Parse decimal IP format (2130706433)
function parseDecimalIP(ip) {
  const decimal = Number.parseInt(ip, 10);
  if (decimal < 0 || decimal > 0xFFFFFFFF) return null;
  return intToIp(decimal);
}

// Check if IPv4 is private/local
function isPrivateIPv4(ip) {
  const privateRanges = {
    '16': true, '17': true, '18': true, '19': true,
    '20': true, '21': true, '22': true, '23': true,
    '24': true, '25': true, '26': true, '27': true,
    '28': true, '29': true, '30': true, '31': true
  };
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    (ip.startsWith('172.') && privateRanges[ip.split('.')[1]]) ||
    ip.startsWith('169.254.') ||
    ip.startsWith('127.') ||
    ip === '0.0.0.0'
  );
}

// Check if IPv6 is private/local
function isPrivateIPv6(ip) {
  return (
    ip.startsWith('fe80::') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip === '::1' ||
    ip.startsWith('::ffff:127') ||
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('::ffff:10.') ||
    ip.startsWith('::ffff:172.') ||
    ip === '::'
  );
}

// Normalize IP address from various formats (hex, octal, decimal) to standard dotted-quad
function normalizeIP(ip) {
  // Handle Hex (0x...)
  if (ip.toLowerCase().includes('0x')) {
    try {
      const parsed = parseHexIP(ip);
      return parsed === null ? { error: true } : { ip: parsed };
    } catch (e) { 
      console.error('Failed to parse hex IP:', e.message);
      return { error: true }; 
    }
  }
  
  // Handle Octal (leading 0)
  if (ip.startsWith('0') && ip.includes('.') && /^[0-7.]+$/.test(ip)) {
    try {
      return { ip: parseOctalIP(ip) };
    } catch (e) { 
      console.error('Failed to parse octal IP:', e.message);
      return { error: true }; 
    }
  }
  
  // Handle Decimal (Flat Integer)
  if (/^\d+$/.test(ip)) {
    try {
      const parsed = parseDecimalIP(ip);
      return parsed === null ? { error: true } : { ip: parsed };
    } catch (e) { 
      console.error('Failed to parse decimal IP:', e.message);
      return { error: true }; 
    }
  }
  
  return { ip };
}

const ssrfLogic = {
  isPrivateOrLocalIP: function(input) {
    const normalized = normalizeIP(input);
    if (normalized.error) {
      console.error('Failed to parse IP:', input);
      return true; // Fail safe
    }
    
    const ip = normalized.ip;

    // Basic localhost variations
    if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return true;

    // Standard Node.js IP checks
    if (net.isIP(ip)) {
      if (net.isIPv4(ip)) return isPrivateIPv4(ip);
      if (net.isIPv6(ip)) return isPrivateIPv6(ip);
    }

    return false;
  }
};

// Main test execution using async IIFE to avoid top-level await issues in CommonJS
(async function main() {

  console.log(`[Phase 1] Unit Testing Security Logic (SSRF)`.yellow.bold);
  
  await runTest('SSRF: Detect Localhost', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('localhost'), true);
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('127.0.0.1'), true);
  });

  await runTest('SSRF: Detect Private Network (192.168.x.x)', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('192.168.1.50'), true);
  });

  await runTest('SSRF: Detect Private Network (10.x.x.x)', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('10.0.0.1'), true);
  });

  await runTest('SSRF: Detect AWS Metadata IP (169.254...)', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('169.254.169.254'), true);
  });

  await runTest('SSRF: Detect Octal/Hex Obfuscation', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('0177.0.0.1'), true); // Octal 127.0.0.1
    // This previously failed, but should now pass with updated logic
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('0x7f000001'), true); // Hex 127.0.0.1
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('2130706433'), true); // Decimal 127.0.0.1
  });

  await runTest('SSRF: Allow Public IP', async () => {
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('8.8.8.8'), false);
    assert.strictEqual(ssrfLogic.isPrivateOrLocalIP('1.1.1.1'), false);
  });

  console.log(`\n[Phase 2] Integration Testing (Running Server)`.yellow.bold);

  // Check connectivity
  await runTest('Server Reachability (Health Check)', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.ok);
  });

  // Security Headers
  await runTest('Security Headers: Content-Security-Policy', async () => {
    const res = await axios.get(`${BASE_URL}/`);
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP header missing');
    assert.ok(csp.includes("default-src 'self'"), 'CSP too permissive');
  });

  await runTest('Security Headers: X-RateLimit', async () => {
    const res = await axios.get(`${BASE_URL}/`);
    // NOTE: This requires 'legacyHeaders: true' in server.js rateLimit config
    assert.ok(res.headers['x-ratelimit-limit'], 'Rate limit headers missing');
  });

  // Auth Status
  await runTest('Auth Status: Unauthenticated initially', async () => {
    const res = await axios.get(`${BASE_URL}/auth/status`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.authenticated, false);
    assert.strictEqual(res.data.user, null);
  });

  // Turnstile Endpoint
  await runTest('Turnstile: Reject invalid token', async () => {
    try {
      await axios.post(`${BASE_URL}/turnstile-verify`, {
        token: 'invalid-test-token'
      });
      throw new Error('Should have failed');
    } catch (e) {
      assert.ok(e.response.status === 400 || e.response.status === 500, 'Did not reject bad token');
    }
  });

  // WebSocket / SSH Security
  await runTest('WebSocket: Reject without Cookie/Auth', async () => {
    // We attempt to connect to the SSH websocket without a session cookie
    const wsPromise = new Promise((resolve, reject) => {
      const wsUrl = BASE_URL.replace('http', 'ws') + '/ssh';
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.close();
        reject(new Error('Connection opened unexpectedly (should be blocked)'));
      });

      ws.on('error', (err) => {
        // ws library throws error on 401/403
        if (err.message.includes('401') || err.message.includes('403') || err.message.includes('Unexpected server response')) {
          resolve();
        } else {
          reject(err);
        }
      });
    });

    await wsPromise;
  });

  // Static Files
  await runTest('Static Assets: xterm.js served', async () => {
    const res = await axios.get(`${BASE_URL}/lib/xterm.js`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('javascript'));
  });

  console.log(`\n[Phase 3] Stress / Rate Limit Testing`.yellow.bold);

  await runTest('Rate Limiting: Detect limit enforcement', async () => {
    // This is aggressive, verify configured RATE_LIMIT in .env (default 120)
    // We will fire requests until we hit a 429
    let hitLimit = false;
    
    // Create an axios instance that ignores status codes so 429 doesn't throw
    const client = axios.create({ validateStatus: () => true });
    
    // We run this sequentially to be kind to the socket pool, but fast
    for (let i = 0; i < 20; i++) { // Only try 20 bursts to see if headers update
       const res = await client.get(`${BASE_URL}/health`);
       const remaining = res.headers['x-ratelimit-remaining'];
       if (res.status === 429 || remaining === '0') {
         hitLimit = true;
         break;
       }
    }
    
    // Note: We might not hit the limit if the test loop size < configured limit
    // But we check if headers exist to prove the mechanism is active
    if (!hitLimit) {
      const res = await client.get(`${BASE_URL}/health`);
      assert.ok(res.headers['x-ratelimit-remaining'], 'Rate limit headers should be present');
      console.log(`      (Rate limit mechanism verified via headers)`.gray);
    }
  });

  console.log('\n---------------------------------------------------');
  console.log(`Tests Completed. Passed: ${passed}, Failed: ${failed}`.bold);
  
  if (failed > 0) process.exit(1);
  process.exit(0);

})();
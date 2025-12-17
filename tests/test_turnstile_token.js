/**
 * Test suite for Turnstile token validation
 * Tests the consumeVerifiedToken function from lib/turnstile.js
 */

const assert = require('node:assert');
const { consumeVerifiedToken } = require('../lib/turnstile');

// Mock Logger
const mockLogger = {
  debug: () => {}, // formatted log arguments don't matter for logic tests
  warn: () => {},
  error: () => {}
};

// Mock Session Store
const mockSessionStore = {
  _sessions: new Map(),
  
  // Implementation of .all() required by consumeVerifiedToken
  all: function(cb) {
    // Simulate async callback
    process.nextTick(() => {
      const sessionsObj = {};
      for (const [id, sess] of this._sessions) {
        sessionsObj[id] = sess; // Simplified copy
      }
      cb(null, sessionsObj);
    });
  },

  // Implementation of .set() required by consumeVerifiedToken
  set: function(id, sess, cb) {
    // Simulate async callback
    process.nextTick(() => {
      this._sessions.set(id, sess);
      if (cb) cb(null);
    });
  },

  // Helper methods for setting up test state
  setSync: function(id, sess) {
    this._sessions.set(id, sess);
  },
  getSync: function(id) {
    return this._sessions.get(id);
  },
  clear: function() {
    this._sessions.clear();
  }
};

// Mock configuration constants matching server.js for consistency in logic testing
const TURNSTILE_TOKEN_TTL_MS = 30000;

// Wrapper to make testing async callback easier with async/await
function verifyToken(token, ip) {
  return new Promise(resolve => {
    consumeVerifiedToken(token, ip, mockSessionStore, mockLogger, (result) => {
      resolve(result);
    });
  });
}

console.log('Running Turnstile Token Tests (Async)...\n');

try {
  // Test 1: Valid token with matching IP
  console.log('Test 1: Valid token with matching IP');
  mockSessionStore.clear();
  const validToken = 'test-token-123';
  const testIp = '192.168.1.100';
  mockSessionStore.setSync('session1', {
    turnstileToken: validToken,
    turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
    turnstileVerifiedIP: testIp
  });

  const result1 = await verifyToken(validToken, testIp);
  assert.strictEqual(result1, true, 'Should accept valid token with matching IP');
  assert.strictEqual(mockSessionStore.getSync('session1').turnstileToken, undefined, 'Token should be consumed');
  console.log('✓ Passed\n');

  // Test 2: Expired token
  console.log('Test 2: Expired token');
  mockSessionStore.clear();
  const expiredToken = 'expired-token-456';
  mockSessionStore.setSync('session2', {
    turnstileToken: expiredToken,
    turnstileTokenExpires: Date.now() - 1000, // Expired 1 second ago
    turnstileVerifiedIP: testIp
  });

  const result2 = await verifyToken(expiredToken, testIp);
  assert.strictEqual(result2, false, 'Should reject expired token');
  console.log('✓ Passed\n');

  // Test 3: IP mismatch
  console.log('Test 3: IP mismatch');
  mockSessionStore.clear();
  const ipToken = 'ip-token-789';
  mockSessionStore.setSync('session3', {
    turnstileToken: ipToken,
    turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
    turnstileVerifiedIP: '192.168.1.100'
  });

  const result3 = await verifyToken(ipToken, '192.168.1.200');
  assert.strictEqual(result3, false, 'Should reject token with IP mismatch');
  console.log('✓ Passed\n');

  // Test 4: Token not found
  console.log('Test 4: Token not found');
  mockSessionStore.clear();
  const result4 = await verifyToken('nonexistent-token', testIp);
  assert.strictEqual(result4, false, 'Should reject nonexistent token');
  console.log('✓ Passed\n');

  // Test 5: Invalid token format
  console.log('Test 5: Invalid token format');
  assert.strictEqual(await verifyToken(null, testIp), false, 'Should reject null token');
  assert.strictEqual(await verifyToken('', testIp), false, 'Should reject empty token');
  assert.strictEqual(await verifyToken(123, testIp), false, 'Should reject non-string token');
  console.log('✓ Passed\n');

  // Test 6: Token can only be used once
  console.log('Test 6: Token can only be used once (one-time use)');
  mockSessionStore.clear();
  const oneTimeToken = 'one-time-token-999';
  mockSessionStore.setSync('session4', {
    turnstileToken: oneTimeToken,
    turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
    turnstileVerifiedIP: testIp
  });

  assert.strictEqual(await verifyToken(oneTimeToken, testIp), true, 'First use should succeed');
  assert.strictEqual(await verifyToken(oneTimeToken, testIp), false, 'Second use should fail (token consumed)');
  console.log('✓ Passed\n');

  // Test 7: Token without IP binding
  console.log('Test 7: Token without IP binding');
  mockSessionStore.clear();
  const noIpToken = 'no-ip-token-111';
  mockSessionStore.setSync('session5', {
    turnstileToken: noIpToken,
    turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS
    // No turnstileVerifiedIP set
  });

  const result7 = await verifyToken(noIpToken, testIp);
  assert.strictEqual(result7, true, 'Should accept token without IP binding');
  console.log('✓ Passed\n');

  console.log('All tests passed! ✓');

} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}

/**
 * Test suite for Turnstile token validation
 * Tests the consumeVerifiedToken function
 */

const assert = require('assert');

// Mock session store for testing
const mockSessionStore = new Map();

// Mock configuration
const TURNSTILE_TOKEN_TTL_MS = 30000; // 30 seconds

/**
 * Mock consumeVerifiedToken function for testing
 * This should match the implementation in server.js
 */
function consumeVerifiedToken(token, remoteIp) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Find session with matching token
  for (const [sessionId, session] of mockSessionStore.entries()) {
    if (session.turnstileToken === token) {
      // Check expiration
      if (!session.turnstileTokenExpires || session.turnstileTokenExpires < Date.now()) {
        console.log('Token expired');
        return false;
      }

      // Check IP binding
      if (session.turnstileVerifiedIP && session.turnstileVerifiedIP !== remoteIp) {
        console.log('IP mismatch');
        return false;
      }

      // Token is valid - consume it (one-time use)
      delete session.turnstileToken;
      delete session.turnstileTokenExpires;
      
      return true;
    }
  }

  console.log('Token not found');
  return false;
}

// Test Suite
console.log('Running Turnstile Token Tests...\n');

// Test 1: Valid token with matching IP
console.log('Test 1: Valid token with matching IP');
mockSessionStore.clear();
const validToken = 'test-token-123';
const testIp = '192.168.1.100';
mockSessionStore.set('session1', {
  turnstileToken: validToken,
  turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
  turnstileVerifiedIP: testIp
});
assert.strictEqual(consumeVerifiedToken(validToken, testIp), true, 'Should accept valid token with matching IP');
assert.strictEqual(mockSessionStore.get('session1').turnstileToken, undefined, 'Token should be consumed');
console.log('✓ Passed\n');

// Test 2: Expired token
console.log('Test 2: Expired token');
mockSessionStore.clear();
const expiredToken = 'expired-token-456';
mockSessionStore.set('session2', {
  turnstileToken: expiredToken,
  turnstileTokenExpires: Date.now() - 1000, // Expired 1 second ago
  turnstileVerifiedIP: testIp
});
assert.strictEqual(consumeVerifiedToken(expiredToken, testIp), false, 'Should reject expired token');
console.log('✓ Passed\n');

// Test 3: IP mismatch
console.log('Test 3: IP mismatch');
mockSessionStore.clear();
const ipToken = 'ip-token-789';
mockSessionStore.set('session3', {
  turnstileToken: ipToken,
  turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
  turnstileVerifiedIP: '192.168.1.100'
});
assert.strictEqual(consumeVerifiedToken(ipToken, '192.168.1.200'), false, 'Should reject token with IP mismatch');
console.log('✓ Passed\n');

// Test 4: Token not found
console.log('Test 4: Token not found');
mockSessionStore.clear();
assert.strictEqual(consumeVerifiedToken('nonexistent-token', testIp), false, 'Should reject nonexistent token');
console.log('✓ Passed\n');

// Test 5: Invalid token format
console.log('Test 5: Invalid token format');
assert.strictEqual(consumeVerifiedToken(null, testIp), false, 'Should reject null token');
assert.strictEqual(consumeVerifiedToken('', testIp), false, 'Should reject empty token');
assert.strictEqual(consumeVerifiedToken(123, testIp), false, 'Should reject non-string token');
console.log('✓ Passed\n');

// Test 6: Token can only be used once
console.log('Test 6: Token can only be used once (one-time use)');
mockSessionStore.clear();
const oneTimeToken = 'one-time-token-999';
mockSessionStore.set('session4', {
  turnstileToken: oneTimeToken,
  turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS,
  turnstileVerifiedIP: testIp
});
assert.strictEqual(consumeVerifiedToken(oneTimeToken, testIp), true, 'First use should succeed');
assert.strictEqual(consumeVerifiedToken(oneTimeToken, testIp), false, 'Second use should fail (token consumed)');
console.log('✓ Passed\n');

// Test 7: Token without IP binding
console.log('Test 7: Token without IP binding');
mockSessionStore.clear();
const noIpToken = 'no-ip-token-111';
mockSessionStore.set('session5', {
  turnstileToken: noIpToken,
  turnstileTokenExpires: Date.now() + TURNSTILE_TOKEN_TTL_MS
  // No turnstileVerifiedIP set
});
assert.strictEqual(consumeVerifiedToken(noIpToken, testIp), true, 'Should accept token without IP binding');
console.log('✓ Passed\n');

console.log('All tests passed! ✓');
console.log('\nNote: This test file uses a mock implementation.');
console.log('Update the consumeVerifiedToken function in server.js to match this logic.');

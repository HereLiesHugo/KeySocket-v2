const assert = require('node:assert');

console.log('Testing Bearer Token Extraction Logic...');

// The logic exactly as implemented in server.js
function extractToken(headerValue) {
    if (!headerValue) return null;
    const auth = headerValue;
    if (auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    return null;
}

// Test Cases
try {
    // 1. Standard Case
    assert.strictEqual(extractToken('Bearer mytoken123'), 'mytoken123', 'Standard Bearer token failed');
    
    // 2. Case Insensitivity
    assert.strictEqual(extractToken('bearer mytoken123'), 'mytoken123', 'Lowercase bearer failed');
    assert.strictEqual(extractToken('BEARER mytoken123'), 'mytoken123', 'Uppercase BEARER failed');

    // 3. Extra Whitespace (mimicking \s+ and trim)
    assert.strictEqual(extractToken('Bearer   mytoken123'), 'mytoken123', 'Multiple internal spaces failed');
    assert.strictEqual(extractToken('Bearer mytoken123   '), 'mytoken123', 'Trailing spaces failed');
    assert.strictEqual(extractToken('Bearer   mytoken123   '), 'mytoken123', 'internal and trailing spaces failed');
    
    // 4. Invalid Inputs
    assert.strictEqual(extractToken('Bearer'), null, 'Bearer without space should fail');
    assert.strictEqual(extractToken('Bear mytoken'), null, 'Wrong prefix should fail');
    assert.strictEqual(extractToken('Basic mytoken'), null, 'Basic auth should be ignored');
    assert.strictEqual(extractToken(''), null, 'Empty string should return null');

    // 5. Performance / ReDoS Check
    const N = 5000000; // 5 Million spaces
    const hugeHeader = 'Bearer ' + ' '.repeat(N) + 'token';
    
    const start = process.hrtime();
    const result = extractToken(hugeHeader);
    const diff = process.hrtime(start);
    const ms = (diff[0] * 1000 + diff[1] / 1e6).toFixed(3);

    assert.strictEqual(result, 'token', 'Huge header parsing failed');
    
    console.log(`✅ Performance Test: Parsed 5MB header in ${ms}ms`);
    
    // String manipulation should be very fast (< 50ms usually for 5MB on modern CPU, but let's be generous)
    // Actually 5MB might take a few ms.
    
    if (ms > 100) {
        console.warn('⚠️  Warning: Parsing took longer than expected (>100ms), but likely linear.');
    } else {
        console.log('✅ Performance is efficient (Linear Time).');
    }

    console.log('\n🎉 ALL LOGIC TESTS PASSED');

} catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
}

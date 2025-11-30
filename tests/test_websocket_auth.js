#!/usr/bin/env node

// Test script to verify WebSocket authentication bypass fix
const WebSocket = require('ws');

console.log('Testing WebSocket authentication bypass fix...\n');

// Test 1: Try to connect without authentication (should fail)
console.log('Test 1: Connecting without authentication...');
try {
  const ws1 = new WebSocket('ws://localhost:3000/ssh');
  
  ws1.on('open', () => {
    console.log('❌ FAIL: Connection accepted without authentication!');
    ws1.close();
    process.exit(1);
  });
  
  ws1.on('error', (error) => {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('✅ PASS: Connection rejected without authentication');
      testWithInvalidCookie();
    } else {
      console.log('❌ FAIL: Unexpected error:', error.message);
      process.exit(1);
    }
  });
  
  ws1.on('close', (code, reason) => {
    if (code === 1008 || code === 1006) {
      console.log('✅ PASS: Connection closed with auth error code:', code);
      testWithInvalidCookie();
    }
  });
  
} catch (error) {
  console.log('❌ FAIL: Exception during connection:', error.message);
  process.exit(1);
}

// Test 2: Try to connect with invalid session cookie (should fail)
function testWithInvalidCookie() {
  console.log('\nTest 2: Connecting with invalid session cookie...');
  try {
    const ws2 = new WebSocket('ws://localhost:3000/ssh', {
      headers: {
        'Cookie': 'connect.sid=invalid_session_id'
      }
    });
    
    ws2.on('open', () => {
      console.log('❌ FAIL: Connection accepted with invalid session!');
      ws2.close();
      process.exit(1);
    });
    
    ws2.on('error', (error) => {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.log('✅ PASS: Connection rejected with invalid session');
        console.log('\n🎉 All tests passed! WebSocket authentication bypass has been fixed.');
        process.exit(0);
      } else {
        console.log('❌ FAIL: Unexpected error:', error.message);
        process.exit(1);
      }
    });
    
    ws2.on('close', (code, reason) => {
      if (code === 1008 || code === 1006) {
        console.log('✅ PASS: Connection closed with auth error code:', code);
        console.log('\n🎉 All tests passed! WebSocket authentication bypass has been fixed.');
        process.exit(0);
      }
    });
    
  } catch (error) {
    console.log('❌ FAIL: Exception during connection:', error.message);
    process.exit(1);
  }
}

// Timeout after 10 seconds
setTimeout(() => {
  console.log('❌ FAIL: Test timed out');
  process.exit(1);
}, 10000);

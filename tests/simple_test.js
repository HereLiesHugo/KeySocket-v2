const WebSocket = require('ws');

console.log('Testing WebSocket connection...');

const ws = new WebSocket('ws://localhost:3000/ssh');

ws.on('open', () => {
  console.log('Connection opened');
  ws.close();
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.log('Error:', error.message);
  console.log('Error type:', error.code);
  console.log('Full error:', error);
});

ws.on('close', (code, reason) => {
  console.log('Connection closed. Code:', code, 'Reason:', reason.toString());
});

setTimeout(() => {
  console.log('Test timeout');
  process.exit(0);
}, 5000);

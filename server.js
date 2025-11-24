import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Client as SSHClient } from 'ssh2';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS?.split(',') || ['localhost'];

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active SSH connections
const connections = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
  let sshClient = null;
  let connectionId = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'connect':
          await handleSSHConnect(ws, data, (client, id) => {
            sshClient = client;
            connectionId = id;
          });
          break;

        case 'command':
          if (sshClient && connectionId) {
            handleCommand(sshClient, ws, data.command);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Not connected to SSH server' }));
          }
          break;

        case 'disconnect':
          if (sshClient) {
            sshClient.end();
            if (connectionId) {
              connections.delete(connectionId);
            }
            ws.send(JSON.stringify({ type: 'disconnected' }));
          }
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown command type' }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    if (sshClient) {
      sshClient.end();
      if (connectionId) {
        connections.delete(connectionId);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

async function handleSSHConnect(ws, data, setConnection) {
  const { host, port, username, password, privateKey } = data;

  if (!host || !username) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required connection parameters' }));
    return;
  }

  const connectionId = `${host}-${port}-${Date.now()}`;

  const sshClient = new SSHClient();

  try {
    await new Promise((resolve, reject) => {
      const connectionConfig = {
        host,
        port: port || 22,
        username,
        readyTimeout: 30000,
      };

      if (privateKey) {
        connectionConfig.privateKey = Buffer.from(privateKey);
      } else if (password) {
        connectionConfig.password = password;
      } else {
        return reject(new Error('No authentication method provided'));
      }

      sshClient.on('ready', () => {
        connections.set(connectionId, sshClient);
        setConnection(sshClient, connectionId);
        ws.send(JSON.stringify({ 
          type: 'connected', 
          connectionId,
          message: `Connected to ${username}@${host}:${port}`
        }));
        resolve();
      });

      sshClient.on('error', reject);
      sshClient.connect(connectionConfig);
    });
  } catch (error) {
    console.error('SSH connection error:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Connection failed: ${error.message}`
    }));
    sshClient.end();
  }
}

function handleCommand(sshClient, ws, command) {
  sshClient.exec(command, (err, stream) => {
    if (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      return;
    }

    let output = '';
    let errorOutput = '';

    stream.on('close', (code) => {
      ws.send(JSON.stringify({
        type: 'output',
        data: output,
        error: errorOutput,
        exitCode: code
      }));
    });

    stream.on('data', (data) => {
      output += data.toString();
      ws.send(JSON.stringify({
        type: 'output',
        data: data.toString()
      }));
    });

    stream.stderr.on('data', (data) => {
      errorOutput += data.toString();
      ws.send(JSON.stringify({
        type: 'error-output',
        data: data.toString()
      }));
    });
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`SSH Terminal Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready at ws://localhost:${PORT}`);
});

export default app;

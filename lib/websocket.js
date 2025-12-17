const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const net = require('net');
const dns = require('dns').promises;
const { consumeVerifiedToken } = require('./turnstile');
const logger = require('./logger');

// Configuration
const MAX_IP_SESSIONS = Number.parseInt(process.env.MAX_IP_SESSIONS || '1000', 10);
const CONCURRENT_PER_IP = Number.parseInt(process.env.CONCURRENT_PER_IP || '5', 10);
const MAX_SSH_ATTEMPTS_PER_USER = Number.parseInt(process.env.MAX_SSH_ATTEMPTS_PER_USER || '5', 10);
const SSH_ATTEMPT_RESET_MS = 15 * 60 * 1000;
const WEBSOCKET_PING_INTERVAL_MS = 30000;

// State maps
const ipSessions = new Map();
const sshAttempts = new Map();

// Helper: determine remote IP with proxy awareness
function getReqRemoteIp(req) {
  // Check if BEHIND_PROXY is true (default) in env, or rely on headers if we assume behind proxy
  const BEHIND_PROXY = typeof process.env.BEHIND_PROXY !== 'undefined' ? (process.env.BEHIND_PROXY === 'true') : true;
  if (BEHIND_PROXY && req && req.headers && req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req && req.socket ? req.socket.remoteAddress : 'unknown';
}

function incrIp(ip) {
  const n = (ipSessions.get(ip) || 0) + 1;
  ipSessions.set(ip, n);
  
  if (ipSessions.size > MAX_IP_SESSIONS) {
    const entriesToRemove = ipSessions.size - MAX_IP_SESSIONS;
    let removed = 0;
    for (const [key] of ipSessions.entries()) {
      if (removed >= entriesToRemove) break;
      ipSessions.delete(key);
      removed++;
    }
  }
  return n;
}

function decrIp(ip) {
  const n = Math.max(0, (ipSessions.get(ip) || 1) - 1);
  if (n === 0) ipSessions.delete(ip); else ipSessions.set(ip, n);
  return n;
}

function checkSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };
  const now = Date.now();
  if (now - attempts.lastAttempt > SSH_ATTEMPT_RESET_MS) {
    attempts.count = 0;
  }
  return attempts.count < MAX_SSH_ATTEMPTS_PER_USER;
}

function incrementSshAttempts(userId) {
  const attempts = sshAttempts.get(userId) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  sshAttempts.set(userId, attempts);
  
  if (Math.random() < 0.1) {
    const cutoff = Date.now() - SSH_ATTEMPT_RESET_MS;
    for (const [uid, data] of sshAttempts.entries()) {
      if (data.lastAttempt < cutoff) sshAttempts.delete(uid);
    }
  }
}

function safeParseJson(message) {
  try { return JSON.parse(message); } catch (e) { return null; }
}

// IP Validation & SSRF Protection
function isPrivateOrLocalIP(input) {
  let ip = input;
  const intToIp = (int) => [
    (int >>> 24) & 0xFF, (int >>> 16) & 0xFF, (int >>> 8) & 0xFF, int & 0xFF
  ].join('.');

  if (ip.toLowerCase().includes('0x')) {
    try {
      if (ip.includes('.')) ip = ip.split('.').map(part => Number.parseInt(part, 16)).join('.');
      else {
        const intVal = Number.parseInt(ip, 16);
        if (Number.isNaN(intVal)) return true;
        ip = intToIp(intVal);
      }
    } catch (e) { return true; }
  } else if (ip.startsWith('0') && ip.includes('.') && /^[0-7.]+$/.test(ip)) {
      try { ip = ip.split('.').map(part => Number.parseInt(part, 8)).join('.'); } catch (e) { return true; }
  } else if (/^\d+$/.test(ip)) {
    try {
      const decimal = Number.parseInt(ip, 10);
      if (decimal < 0 || decimal > 0xFFFFFFFF) return true;
      ip = intToIp(decimal);
    } catch (e) { return true; }
  }

  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return true;

  if (net.isIP(ip)) {
    return (
      net.isIPv4(ip) && (
        ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.') || ip.startsWith('127.') || ip === '0.0.0.0' ||
        (ip.startsWith('172.') && { '16':true,'17':true,'18':true,'19':true,'20':true,'21':true,'22':true,'23':true,'24':true,'25':true,'26':true,'27':true,'28':true,'29':true,'30':true,'31':true }[ip.split('.')[1]])
      ) ||
      net.isIPv6(ip) && (
        ip.startsWith('fe80::') || ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1' || ip === '::' ||
        ip.startsWith('::ffff:127') || ip.startsWith('::ffff:192.168.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:172.')
      )
    );
  }
  return false;
}

const IPV4_PATTERN = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;

async function validateHost(hostname, originalHost, sourceIP, userEmail) {
    if (isPrivateOrLocalIP(hostname)) throw new Error('Access to local/private network denied');
    
    const blockedPatterns = [/^\.?localhost$/, /\.local$/, /^\.?internal$/, /^\.?private$/, /^169\.254\.169\.254$/, /^\[?fd[0-9a-fA-F:]+\]?$/, /^\[?fc[0-9a-fA-F:]+\]?$/];
    const blockedDomains = ['metadata.google.internal', 'metadata.azure.com', 'instance-data.ec2.internal', 'instance-data.amazonaws.com'];
    const lowerHost = hostname.toLowerCase();
    
    if (blockedPatterns.some(p => p.test(lowerHost)) || blockedDomains.some(d => lowerHost === d || lowerHost.endsWith('.' + d))) {
      throw new Error('Access to local/private network denied');
    }

    const ipMatch = lowerHost.match(IPV4_PATTERN);
    if (ipMatch && isPrivateOrLocalIP(ipMatch[0])) throw new Error('Access to local/private network denied');
    
    let lookupResults, resolve4Results, resolve6Results;
    try { lookupResults = await dns.lookup(hostname, { all: true }); } catch (err) {}
    try { resolve4Results = await dns.resolve4(hostname); } catch (err) {}
    try { resolve6Results = await dns.resolve6(hostname); } catch (err) {}
    
    const allResults = [];
    if (lookupResults) allResults.push(...lookupResults.map(r => ({ address: r.address, source: 'lookup' })));
    if (resolve4Results) allResults.push(...resolve4Results.map(a => ({ address: a, source: 'resolve4' })));
    if (resolve6Results) allResults.push(...resolve6Results.map(a => ({ address: a, source: 'resolve6' })));
    
    if (allResults.length === 0) throw new Error('DNS resolution failed');
    
    const lookupIPs = new Set(lookupResults ? lookupResults.map(r => r.address) : []);
    const directIPs = new Set([...(resolve4Results || []), ...(resolve6Results || [])]);
    if (lookupIPs.size > 0 && directIPs.size > 0) {
      const intersection = new Set([...lookupIPs].filter(x => directIPs.has(x)));
      if (intersection.size === 0) throw new Error('DNS resolution inconsistency detected');
    }
    
    for (const result of allResults) {
      if (isPrivateOrLocalIP(result.address)) throw new Error('Access to local/private network denied');
    }
    
    return lookupResults && lookupResults.length > 0 ? lookupResults[0].address : allResults[0].address;
}

function initializeWebSocketServer(server, sessionMiddleware, sessionStore) {
  const wss = new WebSocketServer({ 
    server, 
    path: '/ssh', 
    maxPayload: 2 * 1024 * 1024,
    verifyClient: (info, done) => {
      // Use shared session middleware logic
      sessionMiddleware(info.req, {}, () => {
        const req = info.req;
        const remoteIp = getReqRemoteIp(req);

        // Passport session check
        if (!req.session || !req.session.passport || !req.session.passport.user) {
           logger.warn('WebSocket upgrade rejected: unauthenticated', { ip: remoteIp });
           done(false, 401, 'Unauthorized');
           return;
        }

        const user = req.session.passport.user;
        const sessionId = req.session.id; // Express session ID

        // Construct sessionData compatible with previous logic
        const sessionData = {
          authenticated: true,
          user: user,
          session: req.session,
          sessionId: sessionId,
          turnstileVerifiedIP: req.session.turnstileVerifiedIP || null
        };

        // Turnstile Token Handling (Upgrade header)
        let tsToken = null;
        try {
            const protoHeader = req.headers['sec-websocket-protocol'];
            if (protoHeader && protoHeader.includes('ts=')) {
                tsToken = protoHeader.split(',')[0].trim().slice(3);
            } else if (req.headers.authorization) {
                const m = req.headers.authorization.match(/^Bearer\s+(\S+)$/i);
                if (m) tsToken = m[1];
            }
        } catch(e) {}

        if (tsToken) {
            consumeVerifiedToken(tsToken, sessionId, remoteIp, sessionStore, logger, (isValid) => {
                if (!isValid) {
                    done(false, 401, 'Invalid turnstile token');
                    return;
                }
                // Persist verification
                req.session.turnstileVerifiedIP = remoteIp;
                req.session.save(() => {
                    req.sessionData = sessionData;
                    done(true);
                });
            });
            return;
        }

        // Check existing verification
        if (!sessionData.turnstileVerifiedIP || sessionData.turnstileVerifiedIP !== remoteIp) {
            logger.warn('WebSocket upgrade rejected: turnstile verification required', { ip: remoteIp });
            done(false, 401, 'Turnstile verification required');
            return;
        }

        req.sessionData = sessionData;
        done(true);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const ip = getReqRemoteIp(req);
    const sessionData = req.sessionData;
    
    if (!sessionData || !sessionData.authenticated) {
        ws.close(1008, 'Authentication required');
        return;
    }

    logger.info('[WebSocket] New SSH connection', { ip, user_email: sessionData.user.email });

    const concurrent = incrIp(ip);
    if (concurrent > CONCURRENT_PER_IP) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many concurrent sessions' }));
        ws.close();
        decrIp(ip);
        return;
    }

    let sshClient = null, sshStream = null;
    let alive = true;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (msg, isBinary) => {
        if (!alive) return;
        if (!isBinary) {
            const parsed = safeParseJson(msg);
            if (!parsed) return;
            if (parsed.type === 'connect') {
                const { host, port, username, auth, token } = parsed;
                const userId = sessionData.user.id || sessionData.user.email;

                // Validate Turnstile Token in Message (redundant if enforced at upgrade, but good for security)
                if (!token) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Turnstile token required' }));
                    ws.close();
                    return;
                }
                // Check if session has this token (or if it was verified at upgrade, we trust the session binding)
                // Note: Previous logic checked token against session. Since we consumed it at upgrade or rely on session IP binding...
                // The frontend sends the token again. If it was consumed, it won't be in session anymore.
                // BUT, if we have turnstileVerifiedIP, we are good.
                
                // Simplified: If session is IP verified, we allow.
                if (sessionData.session.turnstileVerifiedIP !== ip) {
                     ws.send(JSON.stringify({ type: 'error', message: 'Turnstile verification missing' }));
                     ws.close();
                     return;
                }
                
                ws._turnstileVerified = true;

                if (!checkSshAttempts(userId)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Too many failed SSH attempts' }));
                    ws.close();
                    return;
                }

                if (!host || !username) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Missing host/username' }));
                    ws.close();
                    return;
                }

                let targetAddress;
                try {
                    targetAddress = await validateHost(host, host, ip, sessionData.user.email);
                } catch (err) {
                    logger.warn('SSRF blocked', { host, error: err.message });
                    ws.send(JSON.stringify({ type: 'error', message: err.message }));
                    ws.close();
                    return;
                }

                sshClient = new Client();
                const connectOpts = {
                    host: targetAddress,
                    port: Number.parseInt(port || '22', 10),
                    username: username,
                    readyTimeout: 20000
                };
                if (auth === 'password') connectOpts.password = parsed.password;
                else if (auth === 'key') connectOpts.privateKey = parsed.privateKey;
                if (parsed.passphrase) connectOpts.passphrase = parsed.passphrase;

                const allowed = process.env.ALLOWED_HOSTS;
                if (allowed) {
                    const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
                    if (!list.includes(targetAddress)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Destination not allowed' }));
                        ws.close();
                        return;
                    }
                }

                sshClient.on('ready', () => {
                    ws.send(JSON.stringify({ type: 'ready' }));
                    sshClient.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
                        if (err) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Failed to start shell' }));
                            ws.close();
                            sshClient.end();
                            return;
                        }
                        sshStream = stream;
                        stream.on('data', d => { try { ws.send(d); } catch(e){} });
                        stream.on('close', () => { 
                            try { ws.send(JSON.stringify({ type: 'ssh-closed' })); } catch(e){}
                            ws.close();
                        });
                    });
                });

                sshClient.on('error', (err) => {
                    incrementSshAttempts(userId);
                    ws.send(JSON.stringify({ type: 'error', message: err.message }));
                    ws.close();
                });

                sshClient.connect(connectOpts);
            } else if (parsed.type === 'resize') {
                if (sshStream && sshStream.setWindow) {
                    sshStream.setWindow(Number.parseInt(parsed.rows), Number.parseInt(parsed.cols));
                }
            }
        } else if (sshStream) {
            try { sshStream.write(msg); } catch (e) {}
        }
    });

    ws.on('close', () => {
        alive = false;
        if (sshClient) sshClient.end();
        decrIp(ip);
    });
    ws.on('error', () => ws.terminate());
  });

  // Ping interval
  setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(() => {});
    });
  }, WEBSOCKET_PING_INTERVAL_MS);
  
  return wss;
}

module.exports = { initializeWebSocketServer };

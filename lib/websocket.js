const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const net = require('node:net');
const dns = require('node:dns').promises;
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
  const BEHIND_PROXY = process.env.BEHIND_PROXY === undefined ? true : (process.env.BEHIND_PROXY === 'true');
  if (BEHIND_PROXY && req?.headers?.['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
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
  try { return JSON.parse(message); } catch { return null; }
}

function tryParseHexIp(ip, intToIp) {
    if (!ip.toLowerCase().includes('0x')) return ip;
    try {
      if (ip.includes('.')) return ip.split('.').map(part => Number.parseInt(part, 16)).join('.');
      const intVal = Number.parseInt(ip, 16);
      return Number.isNaN(intVal) ? null : intToIp(intVal);
    } catch (e) {
      logger.debug('Hex IP parse error', { ip, error: e.message });
      return null;
    }
}

function tryParseOctalIp(ip) {
    if (!(ip.startsWith('0') && ip.includes('.') && /^[0-7.]+$/.test(ip))) return ip;
    try {
      return ip.split('.').map(part => Number.parseInt(part, 8)).join('.');
    } catch (e) {
      logger.debug('Octal IP parse error', { ip, error: e.message });
      return null;
    }
}

function tryParseDecimalIp(ip, intToIp) {
    if (!/^\d+$/.test(ip)) return ip;
    try {
      const decimal = Number.parseInt(ip, 10);
      return (decimal < 0 || decimal > 0xFFFFFFFF) ? null : intToIp(decimal);
    } catch (e) {
      logger.debug('Decimal IP parse error', { ip, error: e.message });
      return null;
    }
}

// IP Validation & SSRF Protection
function parseIpAddress(input) {
  const intToIp = (int) => [
    (int >>> 24) & 0xFF, (int >>> 16) & 0xFF, (int >>> 8) & 0xFF, int & 0xFF
  ].join('.');

  let ip = tryParseHexIp(input, intToIp);
  if (ip === null) return null;
  
  ip = tryParseOctalIp(ip);
  if (ip === null) return null;
  
  return tryParseDecimalIp(ip, intToIp);
}

// IP Validation & SSRF Protection
function isPrivateOrLocalIP(input) {
  const ip = parseIpAddress(input);
  if (!ip) return true; // Treat parse failure as potentially dangerous

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

function collectAllDnsAddresses(lookup, resolve4, resolve6) {
    const all = [];
    if (lookup) all.push(...lookup.map(r => ({ address: r.address, source: 'lookup' })));
    if (resolve4) all.push(...resolve4.map(a => ({ address: a, source: 'resolve4' })));
    if (resolve6) all.push(...resolve6.map(a => ({ address: a, source: 'resolve6' })));
    return all;
}

function verifyDnsConsistency(lookup, resolve4, resolve6) {
    const lookupIPs = new Set(lookup ? lookup.map(r => r.address) : []);
    const directIPs = new Set([...(resolve4 || []), ...(resolve6 || [])]);
    if (lookupIPs.size > 0 && directIPs.size > 0) {
      const intersection = new Set([...lookupIPs].filter(x => directIPs.has(x)));
      if (intersection.size === 0) throw new Error('DNS resolution inconsistency detected');
    }
}

async function resolveAndVerifyDns(hostname) {
    let lookupResults, resolve4Results, resolve6Results;
    try { lookupResults = await dns.lookup(hostname, { all: true }); } catch (err) { logger.debug('DNS lookup failed', { hostname, error: err.message }); }
    try { resolve4Results = await dns.resolve4(hostname); } catch (err) { logger.debug('DNS resolve4 failed', { hostname, error: err.message }); }
    try { resolve6Results = await dns.resolve6(hostname); } catch (err) { logger.debug('DNS resolve6 failed', { hostname, error: err.message }); }
    
    const allResults = collectAllDnsAddresses(lookupResults, resolve4Results, resolve6Results);
    if (allResults.length === 0) throw new Error('DNS resolution failed');
    
    verifyDnsConsistency(lookupResults, resolve4Results, resolve6Results);
    
    for (const result of allResults) {
      if (isPrivateOrLocalIP(result.address)) throw new Error('Access to local/private network denied');
    }
    
    return lookupResults?.[0]?.address || allResults[0].address;
}

function checkDomainBlacklist(hostname) {
    const blockedPatterns = [/^\.?localhost$/, /\.local$/, /^\.?internal$/, /^\.?private$/, /^169\.254\.169\.254$/, /^\[?fd[0-9a-fA-F:]+\]?$/, /^\[?fc[0-9a-fA-F:]+\]?$/];
    const blockedDomains = ['metadata.google.internal', 'metadata.azure.com', 'instance-data.ec2.internal', 'instance-data.amazonaws.com'];
    const lowerHost = hostname.toLowerCase();
    
    if (blockedPatterns.some(p => p.test(lowerHost)) || blockedDomains.some(d => lowerHost === d || lowerHost.endsWith('.' + d))) {
      throw new Error('Access to local/private network denied');
    }

    const ipMatch = lowerHost.match(IPV4_PATTERN);
    if (ipMatch && isPrivateOrLocalIP(ipMatch[0])) throw new Error('Access to local/private network denied');
}

async function validateHost(hostname) {
    if (isPrivateOrLocalIP(hostname)) throw new Error('Access to local/private network denied');
    checkDomainBlacklist(hostname);
    return await resolveAndVerifyDns(hostname);
}

function setupSshShell(ws, state) {
  state.sshClient.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
    if (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to start shell' }));
      state.sshClient.end();
      return ws.close();
    }
    state.sshStream = stream;
    stream.on('data', d => { 
      try { ws.send(d); } catch (e) { logger.debug('Send data error', { error: e.message }); }
    });
    stream.on('close', () => { 
      try { ws.send(JSON.stringify({ type: 'ssh-closed' })); } catch (e) { logger.debug('Notify closed error', { error: e.message }); }
      ws.close();
    });
  });
}

function handleTurnstileUpgrade(req, done, sessionData, tsToken, remoteIp, sessionStore) {
    consumeVerifiedToken(tsToken, sessionData.sessionId, remoteIp, sessionStore, logger, (isValid) => {
        if (!isValid) return done(false, 401, 'Invalid turnstile token');
        
        req.session.turnstileVerifiedIP = remoteIp;
        req.sessionData = sessionData;
        req.session.save((err) => {
            if (err) logger.error('Session save error during upgrade', { error: err.message });
            done(true);
        });
    });
}

async function handleSshConnect(ws, state, sessionData, ip, parsed) {
    const { host, port, username, auth, token } = parsed;
    
    if (!token || sessionData.session.turnstileVerifiedIP !== ip) {
        ws.send(JSON.stringify({ type: 'error', message: 'Turnstile verification required' }));
        return ws.close();
    }

    if (!checkSshAttempts(state.userId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many failed SSH attempts' }));
        return ws.close();
    }

    if (!host || !username) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing host/username' }));
        return ws.close();
    }

    let targetAddress;
    try {
        targetAddress = await validateHost(host);
    } catch (err) {
        logger.warn('SSRF blocked', { host, error: err.message });
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        return ws.close();
    }

    const allowed = process.env.ALLOWED_HOSTS;
    if (allowed) {
        const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
        if (!list.includes(targetAddress)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Destination not allowed' }));
            return ws.close();
        }
    }

    state.sshClient = new Client();
    const connectOpts = {
        host: targetAddress,
        port: Number.parseInt(port || '22', 10),
        username,
        readyTimeout: 20000
    };
    if (auth === 'password') connectOpts.password = parsed.password;
    else if (auth === 'key') connectOpts.privateKey = parsed.privateKey;
    if (parsed.passphrase) connectOpts.passphrase = parsed.passphrase;

    state.sshClient.on('ready', () => {
        ws.send(JSON.stringify({ type: 'ready' }));
        setupSshShell(ws, state);
    });

    state.sshClient.on('error', (err) => {
        incrementSshAttempts(state.userId);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
    });

    state.sshClient.connect(connectOpts);
}

function onWsConnection(ws, req) {
    const ip = getReqRemoteIp(req);
    const sessionData = req.sessionData;
    
    if (!sessionData?.authenticated) {
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

    const state = {
        sshClient: null,
        sshStream: null,
        alive: true,
        userEmail: sessionData.user.email,
        userId: sessionData.user.id || sessionData.user.email
    };

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (msg, isBinary) => {
        if (!state.alive) return;
        if (!isBinary) {
            const parsed = safeParseJson(msg);
            if (!parsed) return;
            
            if (parsed.type === 'connect') {
                await handleSshConnect(ws, state, sessionData, ip, parsed);
            } else if (parsed.type === 'resize' && state.sshStream?.setWindow) {
                try {
                    state.sshStream.setWindow(Number.parseInt(parsed.rows), Number.parseInt(parsed.cols));
                } catch (e) {
                    logger.debug('Resize error', { error: e.message });
                }
            }
        } else if (state.sshStream) {
            try { 
                state.sshStream.write(msg); 
            } catch (e) {
                logger.debug('Write to SSH stream error', { error: e.message });
            }
        }
    });

    ws.on('close', () => {
        state.alive = false;
        if (state.sshClient) state.sshClient.end();
        decrIp(ip);
    });
    ws.on('error', (err) => {
        logger.debug('WS Error', { error: err.message });
        ws.terminate();
    });
}

function initializeWebSocketServer(server, sessionMiddleware, sessionStore) {
  const wss = new WebSocketServer({ 
    server, 
    path: '/ssh', 
    maxPayload: 2 * 1024 * 1024,
    verifyClient: (info, done) => {
      sessionMiddleware(info.req, {}, () => {
        const req = info.req;
        const remoteIp = getReqRemoteIp(req);

        if (!req.session?.passport?.user) {
           logger.warn('WebSocket upgrade rejected: unauthenticated', { ip: remoteIp });
           return done(false, 401, 'Unauthorized');
        }

        const sessionData = {
          authenticated: true,
          user: req.session.passport.user,
          session: req.session,
          sessionId: req.session.id,
          turnstileVerifiedIP: req.session.turnstileVerifiedIP || null
        };

        const tsToken = req.headers['sec-websocket-protocol']?.includes('ts=') 
          ? req.headers['sec-websocket-protocol'].split(',')[0].trim().slice(3)
          : /^Bearer\s+(\S+)$/i.exec(req.headers.authorization)?.[1];

        if (tsToken) {
            handleTurnstileUpgrade(req, done, sessionData, tsToken, remoteIp, sessionStore);
            return;
        }

        if (sessionData.turnstileVerifiedIP !== remoteIp) {
            logger.warn('WebSocket upgrade rejected: turnstile verification required', { ip: remoteIp });
            return done(false, 401, 'Turnstile verification required');
        }

        req.sessionData = sessionData;
        done(true);
      });
    }
  });

  wss.on('connection', (ws, req) => onWsConnection(ws, req));

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

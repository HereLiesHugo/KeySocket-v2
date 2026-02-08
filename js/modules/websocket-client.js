/**
 * WebSocket Client Module - SSH/WebSocket connection handling
 * Manages WebSocket lifecycle, SSH commands, and terminal data
 */

// Module state
let socket = null;

/**
 * Get current WebSocket instance
 * @returns {WebSocket|null}
 */
export function getSocket() {
    return socket;
}

/**
 * Build WebSocket URL with optional Turnstile token
 * @param {string} turnstileToken - Turnstile verification token
 * @returns {string}
 */
function wsUrl(turnstileToken) {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = protocol + '//' + loc.host + '/ssh';
    if (turnstileToken) url += '?ts=' + encodeURIComponent(turnstileToken);
    return url;
}

/**
 * Connect to SSH server via WebSocket
 * @param {Object} config - Connection configuration
 * @param {Object} callbacks - Event callbacks
 * @returns {WebSocket|null}
 */
export function connect(config, callbacks) {
    const {
        form,
        authSelect,
        privateKeyText,
        turnstileToken,
        terminal,
        fitAddon,
        terminalArea
    } = config;
    
    const {
        onConnecting,
        onReady,
        onError,
        onClose,
        onMessage,
        showBanner,
        reRunTurnstile,
        checkAuthStatus
    } = callbacks;

    if (socket) return socket;
    if (!terminal) return null;
    
    try { terminal.clear(); } catch (e) {}
    try { terminal.focus(); } catch (e) {}

    // Check token validity
    if (!turnstileToken) {
        if (reRunTurnstile) reRunTurnstile();
        try { terminal.writeln('\r\n[INFO] Turnstile token missing; please complete verification.'); } catch (e) {}
        if (showBanner) showBanner('Turnstile verification required before connecting.', 'info');
        return null;
    }

    socket = new WebSocket(wsUrl(turnstileToken));
    socket.binaryType = 'arraybuffer';

    socket.addEventListener('open', () => {
        const payload = {
            type: 'connect',
            host: form.host.value,
            port: form.port.value || 22,
            username: form.username.value,
            auth: authSelect ? authSelect.value : 'password',
            token: turnstileToken
        };
        
        if (authSelect && authSelect.value === 'password') {
            payload.password = form.password.value;
        } else {
            payload.privateKey = privateKeyText || null;
            if (form.passphrase && form.passphrase.value) {
                payload.passphrase = form.passphrase.value;
            }
        }

        socket.send(JSON.stringify(payload));
        if (onConnecting) onConnecting();
        if (showBanner) showBanner('Connecting to SSH host...', 'info');
    });

    socket.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'error') {
                    terminal.writeln('\r\n[ERROR] ' + msg.message);
                    if (showBanner) showBanner(msg.message || 'SSH error occurred.', 'error');
                } else if (msg.type === 'ready') {
                    terminal.writeln('\r\n[SSH Ready]');
                    if (showBanner) showBanner('SSH session ready.', 'success');
                    if (onReady) onReady();
                } else if (msg.type === 'ssh-closed') {
                    terminal.writeln('\r\n[SSH Closed]');
                    if (showBanner) showBanner('SSH session closed.', 'info');
                }
            } catch (e) {
                terminal.writeln('\r\n' + ev.data);
            }
            return;
        }
        // Binary data -> print to terminal
        const data = new Uint8Array(ev.data);
        terminal.write(new TextDecoder().decode(data));
        if (onMessage) onMessage(data);
    });

    socket.addEventListener('close', () => {
        try { terminal.writeln('\r\n[Disconnected]'); } catch (e) {}
        socket = null;
        if (onClose) onClose();
        if (showBanner) showBanner('Disconnected from server.', 'info');
    });

    socket.addEventListener('error', (err) => {
        try { terminal.writeln('\r\n[Socket error]'); } catch (e) {}
        console.error('ws error', err);
        
        const errorMessage = err.message || '';
        if (err.code === 1008 || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            if (showBanner) showBanner('Authentication required. Please complete Google OAuth login.', 'error');
            try { terminal.writeln('\r\n[ERROR] Authentication required - please complete login first'); } catch (e) {}
            if (checkAuthStatus) checkAuthStatus();
        } else {
            if (showBanner) showBanner('WebSocket connection error.', 'error');
        }
        if (onError) onError(err);
    });

    // Terminal input -> WebSocket
    if (typeof terminal.onData === 'function') {
        terminal.onData((d) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(new TextEncoder().encode(d));
        });
    }

    // Resize handling
    function sendResize() {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const cols = terminal.cols;
        const rows = terminal.rows;
        socket.send(JSON.stringify({ type: 'resize', cols, rows }));
    }

    function doResize() {
        if (fitAddon && typeof fitAddon.fit === 'function') {
            try { fitAddon.fit(); } catch (e) { console.error('fit.fit error:', e); }
        }
        sendResize();
    }

    window.addEventListener('resize', doResize);
    
    // Watch for terminal-area resizing
    try {
        const resizeObserver = new ResizeObserver(() => { doResize(); });
        if (terminalArea) resizeObserver.observe(terminalArea);
    } catch (e) {
        // ResizeObserver might not be available
    }
    
    setTimeout(sendResize, 250);

    return socket;
}

/**
 * Disconnect from SSH server
 * @param {Object} callbacks - Event callbacks
 */
export function disconnect(callbacks = {}) {
    if (!socket) return;
    try { socket.close(); } catch (e) {}
    socket = null;
    if (callbacks.onDisconnect) callbacks.onDisconnect();
}

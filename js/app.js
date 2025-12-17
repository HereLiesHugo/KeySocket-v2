import { initTerminal, write, onData, focus, term } from './modules/terminal.js';
import { initUI, showBanner } from './modules/ui.js';
import { saveConnection } from './modules/storage.js';

let socket = null;

function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
    }
}

function connect({ host, port, username, auth, password, privateKey, passphrase, token }) {
    if (socket) socket.close();

    const proto = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${globalThis.location.host}/ssh`;
    
    // We can pass token in protocol or just rely on session.
    // If we pass it, we use subprotocol: ['ts=' + token]
    const protocols = token ? ['ts=' + token] : [];
    
    socket = new WebSocket(url, protocols);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        showBanner('WebSocket Connected', 'success');
        // Send connect message
        const msg = JSON.stringify({
            type: 'connect',
            host, port, username, auth, password, privateKey, passphrase, token
        });
        socket.send(msg);
    };

    socket.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'ready') {
                    showBanner('SSH Ready', 'success');
                    focus();
                } else if (parsed.type === 'error') {
                    showBanner(parsed.message, 'error');
                } else if (parsed.type === 'ssh-closed') {
                    showBanner('SSH Connection Closed', 'info');
                }
            } catch(e) {
                console.debug('Failed to parse socket message', e);
                write(data); 
            }
        } else {
            // Binary data for terminal
            try {
                // xterm.write accepts string or Uint8Array
                write(new Uint8Array(data)); 
            } catch(e) {
                console.error('Terminal write error', e);
            }
        }
    };

    socket.onclose = () => {
        showBanner('Connection Closed', 'info');
    };
    
    socket.onerror = (e) => {
        console.error('WS Error', e);
        showBanner('Connection Error', 'error');
    };
}

// Window Load
window.addEventListener('load', () => {
    initTerminal('terminal');
    
    // Pass a send function to UI for keyboard
    initUI({ applyTheme: (t) => { if(term) term.setOption('theme', t); } }, (data) => send(data));
    
    // Terminal input -> Socket
    onData((data) => {
        send(new TextEncoder().encode(data));
    });

    const form = document.getElementById('connect-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            // Handle file input manually
            const keyFile = document.getElementById('keyfile').files[0];
            let pk = '';
            
            if (keyFile) {
                try {
                    pk = await keyFile.text();
                } catch (err) {
                    console.error('Failed to read key file', err);
                    showBanner('Failed to read key file', 'error');
                    return;
                }
            }
            
            doConnect(pk);

            function doConnect(pkText) {
                // Get Turnstile token if needed
                // For now, assume session has it or we grab it from global turnstile widget
                // Simplified:
                const token = globalThis.turnstileToken || ''; 
                // Note: The previous app had complex turnstile logic. 
                // I'm simplifying for the refactor to get base working.
                
                connect({
                    host: fd.get('host'), 
                    port: fd.get('port'), 
                    username: fd.get('username'),
                    auth: fd.get('auth'), 
                    password: fd.get('password'),
                    privateKey: pkText || '', 
                    passphrase: fd.get('passphrase'),
                    token
                });
                
                // Save?
                saveConnection({
                    host: fd.get('host'), port: fd.get('port'), 
                    username: fd.get('username'), auth: fd.get('auth')
                });
            }
        });
    }
});

// Turnstile Integration
globalThis.ksInitTurnstile = function() {
    console.log('Turnstile API loaded');
    if (!globalThis.turnstile) return;
    globalThis.turnstile.render('#turnstile-widget', {
        sitekey: globalThis.Env ? globalThis.Env.TURNSTILE_SITEKEY : '0x4AAAAAAA-generic-sitekey-placeholder',
        callback: function(token) {
            console.log('Turnstile Verified');
            globalThis.turnstileToken = token;
            const banner = document.getElementById('auth-banner');
            if (banner) {
                banner.textContent = 'Verification Complete';
                banner.className = 'auth-banner auth-banner--success';
                banner.hidden = false;
                setTimeout(() => banner.hidden = true, 3000);
            }
        },
    });
};

// If Turnstile loaded before this script
if (globalThis.turnstile) globalThis.ksInitTurnstile();

/* Frontend: xterm.js + WebSocket bridge
 * - Saves connections to localStorage
 * - Supports password or private key (key uploaded and sent to backend) (but not saved)
 */
(function () {
    const Terminal = window.Terminal || null;
    const FitAddon = (window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon)) || null;

    const termEl = document.getElementById('terminal');
    const form = document.getElementById('connect-form');
    const authBannerEl = document.getElementById('auth-banner');
    const authSelect = document.getElementById('auth-select');
    const passwordLabel = document.getElementById('password-label');
    const keyLabel = document.getElementById('key-label');
    const passphraseLabel = document.getElementById('passphrase-label');
    const keyfileInput = document.getElementById('keyfile');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const saveBtn = document.getElementById('save-conn');
    const savedList = document.getElementById('saved-list');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const terminalArea = document.querySelector('.terminal-area');
    const appManagementOverlay = document.getElementById('app-management-overlay');
    const appManagement = document.getElementById('app-management');
    const appManagementToggle = document.getElementById('app-management-toggle');
    const appManagementClose = document.getElementById('app-management-close');
    const appManagementConnectionsList = document.getElementById('app-management-connections-list');
    const appThemeSelect = document.getElementById('app-theme-select');
    const WebglAddon = (window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon)) || null;

    // Configuration constants
    const CONFIG = {
        TURNSTILE_TOKEN_SAFETY_MARGIN_MS: 2000,  // Safety margin before token expiration
        BANNER_AUTO_HIDE_MS: 6000,               // Auto-hide banner after 6 seconds
        RESIZE_DEBOUNCE_MS: 100,                 // Debounce resize events
        RESIZE_SEND_DELAY_MS: 250,               // Delay before sending resize to server
        AUTH_CHECK_DELAY_MS: 100,                // Delay before checking auth status
        TURNSTILE_MAX_RETRIES: 2,                // Max retries for Turnstile verification
        TURNSTILE_RETRY_BASE_MS: 200,            // Base delay for exponential backoff
        MAX_SAVED_CONNECTIONS: 20,               // Maximum saved connections in localStorage
        MIN_TERMINAL_WIDTH: 300,                 // Minimum terminal width in pixels
        MIN_TERMINAL_HEIGHT: 200,                // Minimum terminal height in pixels
        PORT_MIN: 1,                             // Minimum valid port number
        PORT_MAX: 65535                          // Maximum valid port number
    };

    // Debug mode - enable with ?debug=1 in URL or on localhost
    const DEBUG = window.location.hostname === 'localhost' || window.location.search.includes('debug=1');
    function log(...args) {
        if (DEBUG) console.log(...args);
    }

    function escapeHTML(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    let term;
    let fit;
    let currentTheme = 'dark';

    // Wait until the font is loaded before initializing the terminal
    document.fonts.ready.then(function () {
        if (Terminal && typeof Terminal === 'function') {
            term = new Terminal({
                rendererType: 'webgl', // Use WebGL renderer
                cursorBlink: true,
                fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                fontSize: 14,
                allowTransparency: false,
                theme: {
                    background: '#0b1220',
                    foreground: '#cbd5e1'
                }
            });

            // Load addons
            if (FitAddon && (typeof FitAddon === 'function' || typeof FitAddon === 'object')) {
                try {
                    fit = new (FitAddon.FitAddon || FitAddon)();
                } catch (e) {
                    try {
                        fit = new FitAddon();
                    } catch (ee) {
                        fit = null;
                    }
                }
                try {
                    if (fit && typeof fit.fit === 'function') term.loadAddon(fit);
                } catch (e) {
                    /* ignore addon load errors */
                }
            }

            if (WebglAddon && (typeof WebglAddon === 'function' || typeof WebglAddon === 'object')) {
                try {
                    term.loadAddon(new (WebglAddon.WebglAddon || WebglAddon)());
                } catch (e) {
                    console.error('WebGL addon failed to load', e);
                }
            } else {
                console.error('WebGL addon not found');
            }

            try {
                term.open(termEl);
            } catch (e) {
                console.error('term.open failed', e);
            }

            try {
                if (fit && typeof fit.fit === 'function') fit.fit();
            } catch (e) { /* ignore fit errors */ }

            // Apply the stored theme after the terminal has been opened and sized,
            // giving xterm a tick to finish internal initialization.
            try {
                setTimeout(() => {
                    try {
                        applyThemeFromStorage();
                    } catch (e) {}
                }, 0);
            } catch (e) {}

            // initialize the virtual keyboard after terminal is ready
            initVirtualKeyboard();
        } else {
            // If Terminal not present, create fallback terminal object
            fallbackTerminal();
        }
    });

    function initVirtualKeyboard() {
        const container = document.querySelector('.keyboard-container');
        if (!container) return;

        const state = { shift: false, ctrl: false, layout: 'qwerty' }; // Default to qwerty

        // --- Key Definitions with Proportional Flex Widths ---
        const keyLayouts = {
            qwerty: [
                // Row 1 (Total: 14 flex units)
                [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
                // Row 2 (Total: 14 flex units)
                [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
                // Row 3 (Total: 14 flex units)
                [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'enter', code: 'Enter', flex: 2.5 }],
                // Row 4 (Total: 14 flex units)
                [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: ',', shiftKey: '<', code: 'Comma', flex: 1 }, { key: '.', shiftKey: '>', code: 'Period', flex: 1 }, { key: '/', shiftKey: '?', code: 'Slash', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
                // Row 5 (Total: 14 flex units)
                [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
            ],
            azerty: [
                // Row 1
                [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '&', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: 'é', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '"', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '\'', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '(', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '-', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: 'è', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '_', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: 'ç', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: 'à', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
                // Row 2
                [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
                // Row 3
                [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: 'enter', code: 'Enter', flex: 1.5 }],
                // Row 4
                [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: ',', shiftKey: '?', code: 'Comma', flex: 1 }, { key: ';', shiftKey: '.', code: 'Semicolon', flex: 1 }, { key: ':', shiftKey: '/', code: 'Colon', flex: 1 }, { key: '!', shiftKey: '§', code: 'Exclamation', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
                // Row 5
                [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
            ],
            symbols: [
                // Row 1
                [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
                // Row 2
                [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: '[', shiftKey: '{', code: 'BracketLeft', flex: 1 }, { key: ']', shiftKey: '}', code: 'BracketRight', flex: 1 }, { key: ';', shiftKey: ':', code: 'Semicolon', flex: 1 }, { key: '\'', shiftKey: '"', code: 'Quote', flex: 1 }, { key: '=', shiftKey: '+', code: 'Equal', flex: 1 }, { key: '-', shiftKey: '_', code: 'Minus', flex: 1 }],
                // Row 3 -> Empty on purpose for spacing
                [],
                // Row 4
                [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }],
                // Row 5
                [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'abc', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
            ]
        };

        const escapeCodes = {
            'Enter': '\r', 'Backspace': '\x7f', 'Tab': '\t', 'Escape': '\x1b', 'Space': ' ',
            'ArrowUp': '\x1b[A', 'ArrowDown': '\x1b[B', 'ArrowRight': '\x1b[C', 'ArrowLeft': '\x1b[D'
        };

        function sendToSocket(data) {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(new TextEncoder().encode(data));
        }

        container.addEventListener('click', (e) => {
            const keyEl = e.target.closest('.keyboard-key');
            if (!keyEl || !term) return;

            const code = keyEl.dataset.code;
            const char = state.shift ? keyEl.dataset.shiftKey : keyEl.dataset.key;

            if (code === 'ShiftLeft' || code === 'ShiftRight') {
                state.shift = !state.shift;
                renderKeyboard();
                return;
            }
            if (code === 'ControlLeft') {
                state.ctrl = !state.ctrl;
                keyEl.classList.toggle('keyboard-key--active', state.ctrl);
                return;
            }
            if (code === 'Symbols') {
                state.layout = (state.layout === 'qwerty' || state.layout === 'azerty') ? 'symbols' : state.layout;
                renderKeyboard();
                return;
            }
            if (code === 'Lang') {
                state.layout = state.layout === 'qwerty' ? 'azerty' : 'qwerty';
                renderKeyboard();
                return;
            }

            if (escapeCodes[code]) {
                sendToSocket(escapeCodes[code]);
            } else if (char) {
                if (state.ctrl && char.length === 1) {
                    const charCode = char.toUpperCase().charCodeAt(0);
                    if (charCode >= 65 && charCode <= 90) { // A-Z
                        sendToSocket(String.fromCharCode(charCode - 64));
                    } else {
                        sendToSocket(char);
                    }
                } else {
                    sendToSocket(char);
                }
            }

            if (state.shift) {
                state.shift = false;
                renderKeyboard();
            }
            if (state.ctrl) {
                state.ctrl = false;
                const ctrlKeyEl = document.querySelector('[data-code="ControlLeft"]');
                if (ctrlKeyEl) ctrlKeyEl.classList.remove('keyboard-key--active');
            }
            term.focus();
        });

        function renderKeyboard() {
            const layout = keyLayouts[state.layout] || [];
            // Clear container safely
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            
            // Use DocumentFragment for batch DOM updates (reduces reflows)
            const fragment = document.createDocumentFragment();
            
            layout.forEach(row => {
                const rowDiv = document.createElement('div');
                rowDiv.className = 'keyboard-row';
                
                row.forEach(key => {
                    const displayChar = state.shift ? (key.shiftKey || key.key.toUpperCase()) : key.key;
                    const keyChar = key.key;
                    const shiftChar = key.shiftKey || key.key.toUpperCase();
                    const flex = key.flex || 1;
                    let className = 'keyboard-key';
                    if (key.modifier && (state.shift || state.ctrl)) className += ' keyboard-key--active';

                    const btn = document.createElement('button');
                    btn.className = className;
                    btn.style.flexGrow = flex;
                    btn.setAttribute('data-code', key.code);
                    btn.setAttribute('data-key', keyChar);
                    btn.setAttribute('data-shift-key', shiftChar);
                    btn.textContent = displayChar; // Safe text insertion
                    
                    rowDiv.appendChild(btn);
                });
                
                fragment.appendChild(rowDiv);
            });
            
            // Single DOM update instead of multiple
            container.appendChild(fragment);

            const shiftKeys = container.querySelectorAll('[data-code="ShiftLeft"], [data-code="ShiftRight"]');
            shiftKeys.forEach(k => k.classList.toggle('keyboard-key--active', state.shift));
        }

        renderKeyboard();
    }

    function fallbackTerminal() {
        // graceful fallback: create a minimal stub so rest of UI doesn't crash
        console.error('xterm Terminal constructor not found on window');
        term = {
            write: (s) => { if (termEl) termEl.textContent += s; },
            writeln: (s) => { if (termEl) termEl.textContent += s + '\n'; },
            onData: () => {},
            open: () => {},
            focus: () => {},
            cols: 80,
            rows: 24,
            loadAddon: () => {}
        };
        if (termEl) termEl.textContent = '\n[Terminal not available: xterm.js failed to load]\n';
        window.KeySocket = { connect, disconnect, terminal: term };
    }

    let socket = null;
    let privateKeyText = null;
    let ksTurnstileToken = null;
    let ksTurnstileVerifiedAt = 0;
    let ksTurnstileTTL = 0;
    let ksTurnstileWidgetId = null;
    let ksTurnstileRendered = false;
    let ksIsAuthenticated = false;

    // Memory leak prevention - track event listeners and observers for cleanup
    let resizeListener = null;
    let resizeObserver = null;
    let resizeTimeout = null;

    let uiBannerTimer = null;

    function showConnectionBanner(message, kind) {
        if (!authBannerEl) return;
        if (uiBannerTimer) {
            clearTimeout(uiBannerTimer);
            uiBannerTimer = null;
        }
        authBannerEl.textContent = message || '';
        authBannerEl.classList.remove('auth-banner--success', 'auth-banner--error', 'auth-banner--info');
        if (kind === 'success') authBannerEl.classList.add('auth-banner--success');
        else if (kind === 'error') authBannerEl.classList.add('auth-banner--error');
        else if (kind === 'info') authBannerEl.classList.add('auth-banner--info');
        authBannerEl.hidden = false;
        uiBannerTimer = setTimeout(() => {
            authBannerEl.hidden = true;
        }, CONFIG.BANNER_AUTO_HIDE_MS);
    }

    function setAuthUI() {
        if (!authSelect) return;
        if (authSelect.value === 'password') {
            if (passwordLabel) passwordLabel.style.display = '';
            if (keyLabel) keyLabel.style.display = 'none';
            if (passphraseLabel) passphraseLabel.style.display = 'none';
        } else {
            if (passwordLabel) passwordLabel.style.display = 'none';
            if (keyLabel) keyLabel.style.display = '';
            if (passphraseLabel) passphraseLabel.style.display = '';
        }
    }

    if (authSelect) {
        authSelect.addEventListener('change', setAuthUI);
        setAuthUI();
    }

    // Resize handle for terminal-area
    const resizeHandle = document.getElementById('resize-handle');
    let isResizing = false;
    let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = terminalArea ? terminalArea.offsetWidth : 0;
            startHeight = terminalArea ? terminalArea.offsetHeight : 0;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
        });
    }

    function handleResize(e) {
        if (!isResizing || !terminalArea) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const newWidth = Math.max(300, startWidth + deltaX);
        const newHeight = Math.max(200, startHeight + deltaY);
        terminalArea.style.width = newWidth + 'px';
        terminalArea.style.height = newHeight + 'px';
        // Trigger terminal resize
        if (fit && typeof fit.fit === 'function') {
            try { fit.fit(); } catch (err) { /* ignore */ }
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }

    // Fullscreen toggle
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (terminalArea && terminalArea.requestFullscreen) {
                terminalArea.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
            }
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Exit Fullscreen';
        } else {
            document.exitFullscreen();
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Fullscreen';
        }
    }
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Fullscreen';
        }
    });

    if (keyfileInput) {
        keyfileInput.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => { privateKeyText = r.result; };
            r.readAsText(f);
        });
    }

    function wsUrl() {
        const loc = window.location;
        const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        let url = protocol + '//' + loc.host + '/ssh';
        if (ksTurnstileToken) url += '?ts=' + encodeURIComponent(ksTurnstileToken);
        return url;
    }

    // Cache for localStorage connections to reduce JSON.parse calls
    let connectionsCache = null;

    function getConnections() {
        if (connectionsCache) return connectionsCache;
        try {
            connectionsCache = JSON.parse(localStorage.getItem('ks_connections') || '[]');
            return connectionsCache;
        } catch (e) {
            log('Error parsing connections from localStorage:', e);
            connectionsCache = [];
            return [];
        }
    }

    function setConnections(list) {
        connectionsCache = list.slice(0, CONFIG.MAX_SAVED_CONNECTIONS);
        try {
            localStorage.setItem('ks_connections', JSON.stringify(connectionsCache));
        } catch (e) {
            log('Error saving connections to localStorage:', e);
        }
    }

    function renderAppManagementConnections(list) {
        if (!appManagementConnectionsList) return;
        
        // Clear container safely
        while (appManagementConnectionsList.firstChild) {
            appManagementConnectionsList.removeChild(appManagementConnectionsList.firstChild);
        }
        
        if (!list || !list.length) {
            const p = document.createElement('p');
            p.className = 'app-management-help';
            p.textContent = 'No saved connections yet. Save a connection from the main form, then manage it here.';
            appManagementConnectionsList.appendChild(p);
            return;
        }
        
        list.forEach((c, i) => {
            const host = c.host || '';
            const port = c.port || '22';
            const username = c.username || '';
            const auth = c.auth || 'password';
            const main = (username ? (username + '@') : '') + host + ':' + port;
            const sub = auth === 'password' ? 'Password auth' : 'Private key auth';
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'connection-item';
            itemDiv.setAttribute('data-index', i);
            
            const metaDiv = document.createElement('div');
            metaDiv.className = 'connection-meta';
            
            const mainDiv = document.createElement('div');
            mainDiv.className = 'connection-meta-main';
            mainDiv.textContent = main; // Safe text insertion
            
            const subDiv = document.createElement('div');
            subDiv.className = 'connection-meta-sub';
            subDiv.textContent = sub; // Safe text insertion
            
            metaDiv.appendChild(mainDiv);
            metaDiv.appendChild(subDiv);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'connection-actions';
            
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'edit-btn';
            editBtn.textContent = 'Edit';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            
            itemDiv.appendChild(metaDiv);
            itemDiv.appendChild(actionsDiv);
            
            appManagementConnectionsList.appendChild(itemDiv);
        });
    }

    function saveConnection() {
        if (!form) return;
        const obj = {
            host: form.host.value,
            port: form.port.value,
            username: form.username.value,
            auth: authSelect ? authSelect.value : 'password'
        };
        const list = getConnections();
        list.unshift(obj);
        setConnections(list);
        loadSaved();
    }

    function loadSaved() {
        const list = getConnections();
        if (!savedList) return;
        
        // Clear existing options safely
        while (savedList.firstChild) {
            savedList.removeChild(savedList.firstChild);
        }
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Saved connections';
        savedList.appendChild(defaultOption);
        
        // Add saved connections as options
        list.forEach((c, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${c.username}@${c.host}:${c.port} (${c.auth})`; // Safe text insertion
            savedList.appendChild(option);
        });
        
        renderAppManagementConnections(list);
    }
    loadSaved();

    if (savedList) {
        savedList.addEventListener('change', () => {
            const idx = savedList.value;
            if (idx === '') return;
            const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
            const c = list[parseInt(idx, 10)];
            if (!c || !form) return;
            form.host.value = c.host || '';
            form.port.value = c.port || '22';
            form.username.value = c.username || '';
            if (authSelect) authSelect.value = c.auth || 'password';
            setAuthUI();
        });
    }

    if (saveBtn) saveBtn.addEventListener('click', saveConnection);

    function initAppManagement() {
        if (appManagementToggle && appManagementOverlay) {
            appManagementToggle.addEventListener('click', () => {
                appManagementOverlay.hidden = false;
                appManagementOverlay.style.display = 'flex';
            });
        }
        if (appManagementClose && appManagementOverlay) {
            appManagementClose.addEventListener('click', () => {
                appManagementOverlay.hidden = true;
                appManagementOverlay.style.display = 'none';
            });
        }
        if (appManagementOverlay) {
            appManagementOverlay.addEventListener('click', (e) => {
                if (e.target === appManagementOverlay) {
                    appManagementOverlay.hidden = true;
                    appManagementOverlay.style.display = 'none';
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !appManagementOverlay.hidden) {
                    appManagementOverlay.hidden = true;
                    appManagementOverlay.style.display = 'none';
                }
            });
        }
        if (appManagementConnectionsList) {
            appManagementConnectionsList.addEventListener('click', (e) => {
                const target = e.target;
                if (!target) return;
                const item = target.closest('.connection-item');
                if (!item) return;
                const idxStr = item.getAttribute('data-index');
                if (idxStr === null) return;
                const idx = parseInt(idxStr, 10);
                if (isNaN(idx)) return;
                const list = getConnections();
                const conn = list[idx];
                if (!conn) return;

                if (target.classList.contains('edit-btn')) {
                    if (!form) return;
                    form.host.value = conn.host || '';
                    form.port.value = conn.port || '22';
                    form.username.value = conn.username || '';
                    if (authSelect) authSelect.value = conn.auth || 'password';
                    setAuthUI();
                    if (appManagementOverlay) {
                        appManagementOverlay.hidden = true;
                        appManagementOverlay.style.display = 'none';
                    }
                    try {
                        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } catch (e2) {}
                } else if (target.classList.contains('delete-btn')) {
                    list.splice(idx, 1);
                    setConnections(list);
                    loadSaved();
                }
            });
        }
        renderAppManagementConnections(getConnections());
    }

    const themePresets = {
        dark: {
            css: {
                '--bg': '#0f1720',
                '--panel': '#0b1220',
                '--muted': '#9aa6b2',
                '--accent': '#6ee7b7',
                '--glass': 'rgba(255, 255, 255, 0.02)',
                '--border-subtle': 'rgba(255, 255, 255, 0.04)',
                '--border-light': 'rgba(255, 255, 255, 0.08)',
                '--text-primary': '#cbd5e1'
            },
            terminal: {
                background: '#0b1220',
                foreground: '#cbd5e1'
            }
        },
        darker: {
            css: {
                '--bg': '#020617',
                '--panel': '#020617',
                '--muted': '#6b7280',
                '--accent': '#22c55e',
                '--glass': 'rgba(15, 23, 42, 0.9)',
                '--border-subtle': 'rgba(148, 163, 184, 0.2)',
                '--border-light': 'rgba(148, 163, 184, 0.35)',
                '--text-primary': '#e5e7eb'
            },
            terminal: {
                background: '#020617',
                foreground: '#e5e7eb'
            }
        },
        light: {
            css: {
                '--bg': '#f3f4f6',
                '--panel': '#ffffff',
                '--muted': '#6b7280',
                '--accent': '#0ea5e9',
                '--glass': 'rgba(148, 163, 184, 0.08)',
                '--border-subtle': 'rgba(148, 163, 184, 0.4)',
                '--border-light': 'rgba(148, 163, 184, 0.7)',
                '--text-primary': '#111827'
            },
            terminal: {
                background: '#ffffff',
                foreground: '#111827'
            }
        },
        monokai: {
            css: {
                '--bg': '#272822',
                '--panel': '#1e1f1c',
                '--muted': '#a1a1aa',
                '--accent': '#facc15',
                '--glass': 'rgba(39, 40, 34, 0.85)',
                '--border-subtle': 'rgba(161, 161, 170, 0.4)',
                '--border-light': 'rgba(250, 204, 21, 0.7)',
                '--text-primary': '#f5f5f4'
            },
            terminal: {
                background: '#272822',
                foreground: '#f5f5f4'
            }
        },
        dracula: {
            css: {
                '--bg': '#282a36',
                '--panel': '#20222d',
                '--muted': '#9ea2b8',
                '--accent': '#bd93f9',
                '--glass': 'rgba(40, 42, 54, 0.9)',
                '--border-subtle': 'rgba(189, 147, 249, 0.25)',
                '--border-light': 'rgba(189, 147, 249, 0.45)',
                '--text-primary': '#f8f8f2'
            },
            terminal: {
                background: '#282a36',
                foreground: '#f8f8f2'
            }
        },
        'solarized-dark': {
            css: {
                '--bg': '#002b36',
                '--panel': '#073642',
                '--muted': '#93a1a1',
                '--accent': '#b58900',
                '--glass': 'rgba(7, 54, 66, 0.95)',
                '--border-subtle': 'rgba(147, 161, 161, 0.35)',
                '--border-light': 'rgba(181, 137, 0, 0.6)',
                '--text-primary': '#eee8d5'
            },
            terminal: {
                background: '#002b36',
                foreground: '#eee8d5'
            }
        },
        'solarized-light': {
            css: {
                '--bg': '#fdf6e3',
                '--panel': '#fffef7',
                '--muted': '#657b83',
                '--accent': '#268bd2',
                '--glass': 'rgba(233, 225, 201, 0.9)',
                '--border-subtle': 'rgba(101, 123, 131, 0.35)',
                '--border-light': 'rgba(38, 139, 210, 0.6)',
                '--text-primary': '#073642'
            },
            terminal: {
                background: '#fdf6e3',
                foreground: '#073642'
            }
        }
    };

    function applyTheme(themeKey) {
        const root = document.documentElement;
        const preset = themePresets[themeKey] || themePresets.dark;
        currentTheme = themeKey in themePresets ? themeKey : 'dark';
        const css = preset.css || {};
        Object.keys(css).forEach((k) => {
            root.style.setProperty(k, css[k]);
        });
        if (preset.terminal) {
            // expose terminal colors as CSS variables for styling container/DOM
            try {
                root.style.setProperty('--terminal-bg', preset.terminal.background);
                root.style.setProperty('--terminal-fg', preset.terminal.foreground);
            } catch (e) {}
            if (term && typeof term.setOption === 'function') {
                try {
                    term.setOption('theme', {
                        background: preset.terminal.background,
                        foreground: preset.terminal.foreground
                    });
                } catch (e) {}
            }
        }
        try {
            localStorage.setItem('ks_theme', currentTheme);
        } catch (e) {}
        if (appThemeSelect) {
            appThemeSelect.value = currentTheme;
        }
    }

    function applyThemeFromStorage() {
        let stored = null;
        try {
            stored = localStorage.getItem('ks_theme');
        } catch (e) {}
        if (!stored) stored = 'dark';
        applyTheme(stored);
    }

    function initThemeManagement() {
        if (!appThemeSelect) {
            applyThemeFromStorage();
            return;
        }
        let stored = null;
        try {
            stored = localStorage.getItem('ks_theme');
        } catch (e) {}
        if (!stored) stored = 'dark';
        if (!(stored in themePresets)) stored = 'dark';
        appThemeSelect.value = stored;
        applyTheme(stored);
        appThemeSelect.addEventListener('change', () => {
            const v = appThemeSelect.value || 'dark';
            applyTheme(v);
        });
    }

    function connect(e) {
        if (e) e.preventDefault();
        if (socket) return;
        if (!term) return;
        try { term.clear(); } catch (e) {}
        try { term.focus(); } catch (e) {}

        // Input validation
        if (!form.host.value || !form.host.value.trim()) {
            showConnectionBanner('Please enter a host address.', 'error');
            try { term.writeln('\r\n[ERROR] Host address is required'); } catch (e) {}
            return;
        }
        
        const port = parseInt(form.port.value || '22', 10);
        if (isNaN(port) || port < CONFIG.PORT_MIN || port > CONFIG.PORT_MAX) {
            showConnectionBanner(`Port must be between ${CONFIG.PORT_MIN} and ${CONFIG.PORT_MAX}.`, 'error');
            try { term.writeln(`\r\n[ERROR] Invalid port: ${form.port.value}`); } catch (e) {}
            return;
        }
        
        if (!form.username.value || !form.username.value.trim()) {
            showConnectionBanner('Please enter a username.', 'error');
            try { term.writeln('\r\n[ERROR] Username is required'); } catch (e) {}
            return;
        }
        
        if (authSelect && authSelect.value === 'password') {
            if (!form.password.value) {
                showConnectionBanner('Please enter a password.', 'error');
                try { term.writeln('\r\n[ERROR] Password is required'); } catch (e) {}
                return;
            }
        } else {
            if (!privateKeyText) {
                showConnectionBanner('Please select a private key file.', 'error');
                try { term.writeln('\r\n[ERROR] Private key is required'); } catch (e) {}
                return;
            }
        }

        // FIXED: Always require a token, even if authenticated.
        const now = Date.now();
        if (!ksTurnstileToken || (ksTurnstileTTL && (now > (ksTurnstileVerifiedAt + ksTurnstileTTL - CONFIG.TURNSTILE_TOKEN_SAFETY_MARGIN_MS)))) {
            // token missing or expired (with safety margin) -> re-run Turnstile
            reRunTurnstile();
            try { term.writeln('\r\n[INFO] Turnstile token missing or expired; please complete verification.'); } catch (e) {}
            showConnectionBanner('Turnstile verification required before connecting.', 'info');
            return;
        }

        socket = new WebSocket(wsUrl());
        socket.binaryType = 'arraybuffer';

        socket.addEventListener('open', () => {
            // FIXED: Added token to the payload body to satisfy backend requirements
            const payload = {
                type: 'connect',
                host: form.host.value,
                port: form.port.value || 22,
                username: form.username.value,
                auth: authSelect ? authSelect.value : 'password',
                token: ksTurnstileToken // <--- ADDED THIS LINE
            };
            if (authSelect && authSelect.value === 'password') {
                payload.password = form.password.value;
            } else {
                payload.privateKey = privateKeyText || null;
                // Optional passphrase for encrypted private keys (not stored anywhere)
                if (form.passphrase && form.passphrase.value) {
                    payload.passphrase = form.passphrase.value;
                }
            }

            socket.send(JSON.stringify(payload));
            showConnectionBanner('Connecting to SSH host...', 'info');
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = false;
        });

        socket.addEventListener('message', (ev) => {
            if (typeof ev.data === 'string') {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === 'error') {
                        term.writeln('\r\n[ERROR] ' + msg.message);
                        showConnectionBanner(msg.message || 'SSH error occurred.', 'error');
                    } else if (msg.type === 'ready') {
                        term.writeln('\r\n[SSH Ready]');
                        showConnectionBanner('SSH session ready.', 'success');
                    } else if (msg.type === 'ssh-closed') {
                        term.writeln('\r\n[SSH Closed]');
                        showConnectionBanner('SSH session closed.', 'info');
                    }
                } catch (e) {
                    term.writeln('\r\n' + ev.data);
                }
                return;
            }
            // binary data -> print to terminal
            const data = new Uint8Array(ev.data);
            term.write(new TextDecoder().decode(data));
        });

        socket.addEventListener('close', () => {
            try { term.writeln('\r\n[Disconnected]'); } catch (e) {}
            socket = null;
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = true;
            showConnectionBanner('Disconnected from server.', 'info');
        });

        socket.addEventListener('error', (err) => {
            try { term.writeln('\r\n[Socket error]'); } catch (e) {}
            console.error('ws error', err);
            
            // Check if this is an authentication error
            const errorMessage = err.message || '';
            if (err.code === 1008 || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                showConnectionBanner('Authentication required. Please complete Google OAuth login.', 'error');
                try { term.writeln('\r\n[ERROR] Authentication required - please complete login first'); } catch (e) {}
                // Re-run authentication check
                checkAuthStatus();
            } else {
                showConnectionBanner('WebSocket connection error.', 'error');
            }
        });

        if (typeof term.onData === 'function') {
            term.onData((d) => {
                if (!socket || socket.readyState !== WebSocket.OPEN) return;
                // send raw input as binary
                socket.send(new TextEncoder().encode(d));
            });
        }

        // resize handling with debouncing
        function sendResize() {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            const cols = term.cols;
            const rows = term.rows;
            socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
        
        function doResize() {
            // Debounce resize events to reduce unnecessary calls
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (fit && typeof fit.fit === 'function') {
                    try { fit.fit(); } catch (e) { log('fit.fit error:', e); }
                }
                sendResize();
                resizeTimeout = null;
            }, CONFIG.RESIZE_DEBOUNCE_MS);
        }
        
        // Setup resize handlers with cleanup tracking
        function setupResizeHandlers() {
            resizeListener = doResize;
            window.addEventListener('resize', resizeListener);
            
            // Watch for terminal-area resizing
            try {
                resizeObserver = new ResizeObserver(() => { doResize(); });
                if (terminalArea) resizeObserver.observe(terminalArea);
            } catch (e) {
                // ResizeObserver might not be available in some environments
                log('ResizeObserver not available:', e);
            }
        }
        
        setupResizeHandlers();
        setTimeout(sendResize, CONFIG.RESIZE_SEND_DELAY_MS);
    }

    // Cleanup function to prevent memory leaks
    function cleanupResizeHandlers() {
        if (resizeListener) {
            window.removeEventListener('resize', resizeListener);
            resizeListener = null;
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
            resizeTimeout = null;
        }
    }

    function disconnect() {
        if (!socket) return;
        try { socket.close(); } catch (e) {}
        socket = null;
        cleanupResizeHandlers();
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = true;
    }

    if (form) form.addEventListener('submit', connect);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);

    // Check authentication status on page load
    function checkAuthStatus() {
        // Small delay to ensure session is established
        setTimeout(() => {
            fetch('/auth/status', {
                method: 'GET',
                credentials: 'same-origin'
            }).then(r => r.json()).then(data => {
                log('Auth status check:', data);
                ksIsAuthenticated = !!(data && data.authenticated);
                if (ksIsAuthenticated) {
                    // FIXED: Do NOT skip Turnstile. We need the token for the WebSocket.
                    // Just hide the overlay but ensure initialization runs.
                    const ov = document.getElementById('turnstile-overlay');
                    if (ov) ov.style.display = 'none';
                    if (connectBtn) connectBtn.disabled = false;
                    
                    // Always initialize turnstile to ensure we can get a token
                    initTurnstile(); 
                    log('User authenticated, Turnstile ready for connection verification');
                } else {
                    // User not authenticated, show Turnstile overlay
                    initTurnstile();
                }
            }).catch(err => {
                log('Auth check failed, showing Turnstile', err);
                initTurnstile();
            });
        }, CONFIG.AUTH_CHECK_DELAY_MS);
    }

    // Turnstile handling on site enter
    function onTurnstileToken(token) {
        if (!token) return;
        // FIXED: Allowed even if authenticated to refresh token
        // send token to server for verification (with client-side retry and better error UI)
        verifyTurnstileToken(token).then(j => {
            if (j && j.ok && j.token) {
                ksTurnstileToken = j.token;
                ksTurnstileTTL = parseInt(j.ttl || '30000', 10) || 30000;
                ksTurnstileVerifiedAt = Date.now();

                // Hide overlay if user is authenticated
                if (ksIsAuthenticated) {
                    const ov = document.getElementById('turnstile-overlay');
                    if (ov) ov.style.display = 'none';
                    if (connectBtn) connectBtn.disabled = false;
                } else {
                    window.location.href = '/auth/google';
                }

                // clean up widget
                try {
                    const widgetEl = document.getElementById('turnstile-widget');
                    if (widgetEl && !ksIsAuthenticated) { widgetEl.innerHTML = ''; delete widgetEl.dataset.turnstileRendered; }
                    ksTurnstileWidgetId = null;
                    ksTurnstileRendered = false;
                } catch (e) {}
            } else {
                console.warn('Turnstile verify failed', j);
                showTurnstileError('Verification failed. Please try again.');
            }
        }).catch(err => {
            console.error('turnstile verify error', err);
            showTurnstileError(err && err.message ? err.message : 'Verification error');
        });
    }

    function showTurnstileError(msg) {
        try {
            const ov = document.getElementById('turnstile-overlay');
            if (!ov) return;
            let el = document.getElementById('turnstile-error');
            if (!el) {
                el = document.createElement('div');
                el.id = 'turnstile-error';
                el.style.color = '#ffdddd';
                el.style.background = '#600';
                el.style.padding = '8px';
                el.style.marginTop = '8px';
                el.style.borderRadius = '4px';
                el.style.fontSize = '14px';
                ov.appendChild(el);
            }
            el.textContent = msg;
        } catch (e) { console.error('showTurnstileError failed', e); }
    }

    function verifyTurnstileToken(token, attempt = 0) {
        const backoff = CONFIG.TURNSTILE_RETRY_BASE_MS * Math.pow(2, attempt);
        return fetch('/turnstile-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            credentials: 'same-origin'
        }).then(res => {
            if (res.status >= 500) {
                if (attempt < CONFIG.TURNSTILE_MAX_RETRIES) {
                    return new Promise((resolve, reject) => setTimeout(() => verifyTurnstileToken(token, attempt + 1).then(resolve).catch(reject), backoff));
                }
                throw new Error('Verification provider unavailable (server error). Please try again later.');
            }
            if (res.status === 502 || res.status === 503) throw new Error('Verification provider temporarily unavailable');
            const ct = res.headers.get('content-type') || '';
            if (!/application\/json/.test(ct)) throw new Error('Unexpected response from verification provider');
            return res.json();
        });
    }

    function initTurnstile() {
        // FIXED: Removed "if (ksIsAuthenticated) return;" to allow token generation for logged-in users
        try {
            if (connectBtn && !ksIsAuthenticated) connectBtn.disabled = true;
            const widgetEl = document.getElementById('turnstile-widget');
            if (!widgetEl) return;

            // Prevent double-rendering
            if (widgetEl.dataset && widgetEl.dataset.turnstileRendered === '1') {
                return;
            }

            if (window.turnstile) {
                try {
                    widgetEl.innerHTML = '';
                    ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken });
                    ksTurnstileRendered = true;
                    if (widgetEl.dataset) widgetEl.dataset.turnstileRendered = '1';
                } catch (e) {
                    console.error('turnstile render error', e);
                }
            } else {
                // Load dynamically
                widgetEl.innerHTML = `<div style="color:#b00">Loading verification...</div>`;
                const loadScript = () => {
                    try {
                        const s = document.createElement('script');
                        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ksInitTurnstile&render=explicit';
                        s.async = true; s.defer = true;
                        document.head.appendChild(s);
                    } catch (e) {}
                };
                loadScript();
            }
        } catch (e) { console.error('initTurnstile', e); }
    }

    function reRunTurnstile() {
        // FIXED: Allow re-run even if authenticated if token expired
        const ov = document.getElementById('turnstile-overlay');
        if (ov) ov.style.display = 'flex';
        try {
            if (window.turnstile) {
                if (ksTurnstileWidgetId) {
                    try { window.turnstile.reset(ksTurnstileWidgetId); } catch (e) { ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken }); }
                } else {
                    ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken });
                }
            }
        } catch (e) { console.error('reRunTurnstile', e); }
    }

    // Show a lightweight banner based on ?auth=success|failure|already using static DOM + CSS
    function showAuthBannerFromQuery() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const status = params.get('auth');
            if (!status) return;

            const banner = document.getElementById('auth-banner');
            if (!banner) return;

            let text = '';
            let modifierClass = '';
            if (status === 'success') {
                text = 'Logged in with Google successfully.';
                modifierClass = 'auth-banner--success';
            } else if (status === 'failure') {
                text = 'Login with Google failed. Please try again.';
                modifierClass = 'auth-banner--error';
            } else if (status === 'already') {
                text = 'You are already logged in.';
                modifierClass = 'auth-banner--info';
            } else {
                return;
            }

            banner.textContent = text;
            banner.classList.remove('auth-banner--success', 'auth-banner--error', 'auth-banner--info');
            if (modifierClass) banner.classList.add(modifierClass);
            banner.hidden = false;

            banner.addEventListener('click', () => {
                banner.hidden = true;
            }, { once: true });
        } catch (e) { /* non-fatal */ }
    }

    // expose callback for Cloudflare Turnstile onload
    window.ksInitTurnstile = initTurnstile;

    initAppManagement();
    initThemeManagement();

    // show login result feedback and then check auth status
    showAuthBannerFromQuery();
    checkAuthStatus();

    // Cleanup on page unload to prevent resource leaks
    window.addEventListener('beforeunload', () => {
        if (socket) {
            try { socket.close(); } catch (e) {}
        }
        cleanupResizeHandlers();
    });
})();
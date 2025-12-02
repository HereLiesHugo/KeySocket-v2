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
            container.innerHTML = layout.map(row => `
                <div class="keyboard-row">
                    ${row.map(key => {
                        const displayChar = state.shift ? (key.shiftKey || key.key.toUpperCase()) : key.key;
                        const keyChar = key.key;
                        const shiftChar = key.shiftKey || key.key.toUpperCase();
                        const flex = key.flex || 1;
                        let className = 'keyboard-key';
                        if (key.modifier && (state.shift || state.ctrl)) className += ' keyboard-key--active';

                        return `<button class="${className}" style="flex-grow: ${flex}" data-code="${key.code}" data-key="${keyChar}" data-shift-key="${shiftChar}">${displayChar}</button>`;
                    }).join('')}
                </div>
            `).join('');

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
        }, 6000);
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

    function getConnections() {
        try {
            return JSON.parse(localStorage.getItem('ks_connections') || '[]');
        } catch (e) {
            return [];
        }
    }

    function setConnections(list) {
        localStorage.setItem('ks_connections', JSON.stringify(list.slice(0, 20)));
    }

    function renderAppManagementConnections(list) {
        if (!appManagementConnectionsList) return;
        if (!list || !list.length) {
            appManagementConnectionsList.innerHTML = '<p class="app-management-help">No saved connections yet. Save a connection from the main form, then manage it here.</p>';
            return;
        }
        appManagementConnectionsList.innerHTML = list.map((c, i) => {
            const host = c.host || '';
            const port = c.port || '22';
            const username = c.username || '';
            const auth = c.auth || 'password';
            const main = (username ? (username + '@') : '') + host + ':' + port;
            const sub = auth === 'password' ? 'Password auth' : 'Private key auth';
            return '<div class="connection-item" data-index="' + i + '">' +
                '<div class="connection-meta">' +
                '<div class="connection-meta-main">' + main + '</div>' +
                '<div class="connection-meta-sub">' + sub + '</div>' +
                '</div>' +
                '<div class="connection-actions">' +
                '<button type="button" class="edit-btn">Edit</button>' +
                '<button type="button" class="delete-btn">Delete</button>' +
                '</div>' +
                '</div>';
        }).join('');
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
        savedList.innerHTML = '<option value="">Saved connections</option>' + list.map((c, i) => ` <option value="${i}">${c.username}@${c.host}:${c.port} (${c.auth})</option>`).join('\n');
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

        // If not yet authenticated via Google OAuth, enforce a fresh Turnstile token
        if (!ksIsAuthenticated) {
            const now = Date.now();
            if (!ksTurnstileToken || (ksTurnstileTTL && (now > (ksTurnstileVerifiedAt + ksTurnstileTTL - 2000)))) {
                // token missing or expired (with 2s safety margin) -> re-run Turnstile
                reRunTurnstile();
                try { term.writeln('\r\n[INFO] Turnstile token missing or expired; please complete verification.'); } catch (e) {}
                showConnectionBanner('Turnstile verification required before connecting.', 'info');
                return;
            }
        }

        socket = new WebSocket(wsUrl());
        socket.binaryType = 'arraybuffer';

        socket.addEventListener('open', () => {
            const payload = {
                type: 'connect',
                host: form.host.value,
                port: form.port.value || 22,
                username: form.username.value,
                auth: authSelect ? authSelect.value : 'password'
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

        // resize handling
        function sendResize() {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            const cols = term.cols;
            const rows = term.rows;
            socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
        function doResize() {
            if (fit && typeof fit.fit === 'function') {
                try { fit.fit(); } catch (e) { console.error('fit.fit error:', e); }
            }
            sendResize();
        }
        window.addEventListener('resize', doResize);
        // Watch for terminal-area resizing
        try {
            const resizeObserver = new ResizeObserver(() => { doResize(); });
            if (terminalArea) resizeObserver.observe(terminalArea);
        } catch (e) {
            // ResizeObserver might not be available in some environments
        }
        setTimeout(sendResize, 250);
    }

    function disconnect() {
        if (!socket) return;
        try { socket.close(); } catch (e) {}
        socket = null;
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
                    console.log('Auth status check:', data);
                    ksIsAuthenticated = !!(data && data.authenticated);
                    if (ksIsAuthenticated) {
                        const ov = document.getElementById('turnstile-overlay');
                        if (ov) ov.style.display = 'none';
                        if (connectBtn) connectBtn.disabled = false;
                        // prevent Cloudflare script from re-initializing Turnstile when already authenticated
                        try { window.ksInitTurnstile = function () {}; } catch (e) {}
                        console.log('User authenticated, skipping Turnstile');
                    } else {
                        // User not authenticated, show Turnstile
                        initTurnstile();
                    }
                }).catch(err => {
                    console.log('Auth check failed, showing Turnstile', err);
                    initTurnstile();
                });
            }, 100); // 100ms delay
        }

    // Turnstile handling on site enter
    function onTurnstileToken(token) {
        if (!token) return;
        if (ksIsAuthenticated) return;
        // send token to server for verification and redirect to OAuth
        fetch('/turnstile-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        }).then(r => {
            console.debug('turnstile verify raw response status:', r.status);
            console.debug('turnstile verify raw response headers:', [...r.headers.entries()]);
            return r.text();
        }).then(text => {
            console.debug('turnstile verify raw response text:', text);
            let j;
            try {
                j = JSON.parse(text);
            } catch (e) {
                console.error('Failed to parse JSON response:', text, e);
                throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
            }
            console.debug('turnstile verify parsed response', j);
            if (j && j.ok && j.token) {
                // store the server-issued one-time token temporarily
                ksTurnstileToken = j.token;
                ksTurnstileTTL = parseInt(j.ttl || '30000', 10) || 30000;
                ksTurnstileVerifiedAt = Date.now();

                // Redirect to Google OAuth instead of enabling connect button
                window.location.href = '/auth/google';

                // clean up widget to avoid duplicate renders later
                try {
                    const widgetEl = document.getElementById('turnstile-widget');
                    if (widgetEl) { widgetEl.innerHTML = ''; delete widgetEl.dataset.turnstileRendered; }
                    ksTurnstileWidgetId = null;
                    ksTurnstileRendered = false;
                } catch (e) {}
            } else {
                // leave overlay visible and let user try again; show details
                console.warn('Turnstile verify failed', j);
                try { console.warn('Turnstile verify details:', JSON.stringify(j)); } catch (e) {}
            }
        }).catch(err => console.error('turnstile verify error', err));
    }

    function initTurnstile() {
        if (ksIsAuthenticated) return;
        try {
            // disable connect until verified
            if (connectBtn) connectBtn.disabled = true;
            const widgetEl = document.getElementById('turnstile-widget');
            console.debug('initTurnstile:', { turnstile: !!window.turnstile, widgetEl });
            if (!widgetEl) {
                console.error('Turnstile widget container not found');
                if (connectBtn) connectBtn.disabled = false;
                return;
            }

            // Prevent double-rendering
            if (widgetEl.dataset && widgetEl.dataset.turnstileRendered === '1') {
                console.info('Turnstile already rendered in container; skipping render');
                ksTurnstileRendered = true;
                return;
            }

            if (window.turnstile) {
                try {
                    // clear any placeholder content, then render once
                    widgetEl.innerHTML = '';
                    ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken });
                    ksTurnstileRendered = true;
                    if (widgetEl.dataset) widgetEl.dataset.turnstileRendered = '1';
                    console.info('Turnstile render invoked, widgetId=', ksTurnstileWidgetId);
                } catch (e) {
                    console.error('turnstile render error', e);
                    ksTurnstileWidgetId = null;
                    // show user-friendly error and retry button
                    widgetEl.innerHTML = `<div style="color:#b00">Failed to load verification widget.<br/><button id="turnstile-retry">Retry</button></div>`;
                    const btn = document.getElementById('turnstile-retry');
                    if (btn) btn.addEventListener('click', () => { widgetEl.innerHTML = ''; initTurnstile(); });
                    if (connectBtn) connectBtn.disabled = false;
                }
            } else {
                // turnstile library not loaded yet — attempt to load it dynamically and show helpful hint
                console.warn('Turnstile library not ready');
                widgetEl.innerHTML = `<div style="color:#b00">Verification library not loaded.<br/><div id="turnstile-load-status">Attempting to load...</div><button id="turnstile-retry">Retry</button></div>`;
                const statusEl = document.getElementById('turnstile-load-status');
                const btn2 = document.getElementById('turnstile-retry');
                const loadScript = () => {
                    try {
                        if (statusEl) statusEl.textContent = 'Loading Turnstile library...';
                        // create script element to load the library (will respect CSP)
                        const s = document.createElement('script');
                        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ksInitTurnstile&render=explicit';
                        s.async = true;
                        s.defer = true;
                        s.onload = () => {
                            if (statusEl) statusEl.textContent = 'Loaded, initializing...';
                            try { if (window.ksInitTurnstile) window.ksInitTurnstile(); } catch (e) {}
                        };
                        s.onerror = (ev) => { if (statusEl) statusEl.textContent = 'Failed to load library. Check console and network. CSP may be blocking external scripts.'; console.error('Turnstile script load error', ev); };
                        document.head.appendChild(s);
                        // give a timeout if nothing happens
                        setTimeout(() => { if (!window.turnstile && statusEl && statusEl.textContent.indexOf('Failed') === -1) statusEl.textContent = 'Still loading — check network/CSP and retry.'; }, 4000);
                    } catch (e) { console.error('dynamic load failed', e); if (statusEl) statusEl.textContent = 'Dynamic loader failed'; }
                };
                if (btn2) btn2.addEventListener('click', () => { widgetEl.innerHTML = ''; loadScript(); });
                // try once automatically
                loadScript();
                if (connectBtn) connectBtn.disabled = false;
            }
        } catch (e) { console.error('initTurnstile', e); }
    }

    function reRunTurnstile() {
        if (ksIsAuthenticated) return;
        // show the overlay and reset or re-render the widget to prompt the user
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
})();
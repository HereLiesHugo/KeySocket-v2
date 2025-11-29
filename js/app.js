/* Frontend: xterm.js + WebSocket bridge
 * - Saves connections to localStorage
 * - Supports password or private key (key uploaded and sent to backend) (but not saved)
 */
(function () {
    const Terminal = window.Terminal || null;
    const FitAddon = (window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon)) || null;

    const termEl = document.getElementById('terminal');
    const form = document.getElementById('connect-form');
    const authSelect = document.getElementById('auth-select');
    const passwordLabel = document.getElementById('password-label');
    const keyLabel = document.getElementById('key-label');
    const keyfileInput = document.getElementById('keyfile');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const saveBtn = document.getElementById('save-conn');
    const savedList = document.getElementById('saved-list');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const terminalArea = document.querySelector('.terminal-area');
    const WebglAddon = (window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon)) || null;

    let term;
    let fit;

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

    function setAuthUI() {
        if (!authSelect) return;
        if (authSelect.value === 'password') {
            if (passwordLabel) passwordLabel.style.display = '';
            if (keyLabel) keyLabel.style.display = 'none';
        } else {
            if (passwordLabel) passwordLabel.style.display = 'none';
            if (keyLabel) keyLabel.style.display = '';
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

    function saveConnection() {
        if (!form) return;
        const obj = {
            host: form.host.value,
            port: form.port.value,
            username: form.username.value,
            auth: authSelect ? authSelect.value : 'password'
        };
        const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
        list.unshift(obj);
        localStorage.setItem('ks_connections', JSON.stringify(list.slice(0, 20)));
        loadSaved();
    }

    function loadSaved() {
        const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
        if (!savedList) return;
        savedList.innerHTML = '<option value="">Saved connections</option>' + list.map((c, i) => ` <option value="${i}">${c.username}@${c.host}:${c.port} (${c.auth})</option>`).join('\n');
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

    function connect(e) {
        if (e) e.preventDefault();
        if (socket) return;
        if (!term) return;
        try { term.clear(); } catch (e) {}
        try { term.focus(); } catch (e) {}

        // ensure we have a fresh server-issued token
        const now = Date.now();
        if (!ksTurnstileToken || (ksTurnstileTTL && (now > (ksTurnstileVerifiedAt + ksTurnstileTTL - 2000)))) {
            // token missing or expired (with 2s safety margin) -> re-run Turnstile
            reRunTurnstile();
            try { term.writeln('\r\n[INFO] Turnstile token missing or expired; please complete verification.'); } catch (e) {}
            return;
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
            if (authSelect && authSelect.value === 'password') payload.password = form.password.value;
            else payload.privateKey = privateKeyText || null;

            socket.send(JSON.stringify(payload));
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = false;
        });

        socket.addEventListener('message', (ev) => {
            if (typeof ev.data === 'string') {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === 'error') term.writeln('\r\n[ERROR] ' + msg.message);
                    else if (msg.type === 'ready') term.writeln('\r\n[SSH Ready]');
                    else if (msg.type === 'ssh-closed') term.writeln('\r\n[SSH Closed]');
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
        });

        socket.addEventListener('error', (err) => {
            try { term.writeln('\r\n[Socket error]'); } catch (e) {}
            console.error('ws error', err);
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
                    if (data.authenticated) {
                        // User is already authenticated, hide Turnstile overlay and enable connect
                        const ov = document.getElementById('turnstile-overlay');
                        if (ov) ov.style.display = 'none';
                        if (connectBtn) connectBtn.disabled = false;
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
        // send token to server for verification and redirect to OAuth
        fetch('/turnstile-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        }).then(r => r.json()).then(j => {
            console.debug('turnstile verify response', j);
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

    // expose callback for Cloudflare Turnstile onload
    window.ksInitTurnstile = initTurnstile;

    checkAuthStatus();
})();

(function () {
  // --- DOM Elements ---
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const userInfo = document.getElementById('user-info');
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
  
  // --- App State ---
  let term;
  let fit;
  let socket = null;
  let privateKeyText = null;
  let ksTurnstileToken = null;
  let ksTurnstileVerifiedAt = 0;
  let ksTurnstileTTL = 0;
  let ksTurnstileWidgetId = null;
  let ksTurnstileRendered = false;

  // --- App Initialization ---
  document.addEventListener('DOMContentLoaded', checkUserStatus);

  async function checkUserStatus() {
    try {
      const response = await fetch('/api/user');
      if (!response.ok) throw new Error('Failed to fetch user status');
      const data = await response.json();

      if (data.isAuthenticated) {
        showAppView(data.user);
      } else {
        showLoginView();
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      showLoginView();
    }
  }

  function showLoginView() {
    if(loginView) loginView.style.display = 'block';
    if(appView) appView.style.display = 'none';
  }

  function showAppView(user) {
    if(loginView) loginView.style.display = 'none';
    if(appView) appView.style.display = 'grid';

    if(userInfo) {
        userInfo.innerHTML = `
        <img src="${user.photo}" alt="User photo" title="${user.displayName}">
        <span>${user.displayName}</span>
        <a href="/logout">Logout</a>
        `;
        userInfo.style.display = 'flex';
    }

    initializeApp();
  }

  function initializeApp() {
    const Terminal = window.Terminal || null;
    const FitAddon = (window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon)) || null;
    const WebglAddon = (window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon)) || null;

    document.fonts.ready.then(() => {
      if (Terminal && FitAddon && WebglAddon) {
        term = new Terminal({
          rendererType: 'webgl',
          cursorBlink: true,
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          fontSize: 14,
          allowTransparency: false,
          theme: {
            background: '#0b1220',
            foreground: '#cbd5e1'
          }
        });

        fit = new (FitAddon.FitAddon || FitAddon)();
        term.loadAddon(fit);
        try {
            term.loadAddon(new (WebglAddon.WebglAddon || WebglAddon)());
        } catch (e) {
            console.error("WebGL addon failed to load, falling back to canvas", e);
        }
        
        term.open(termEl);
        fit.fit();
        
        window.KeySocket = { connect, disconnect, terminal: term };
        
        initEventListeners();
        initVirtualKeyboard();
      } else {
        fallbackTerminal();
      }
    });
  }

  function initEventListeners() {
      authSelect.addEventListener('change', setAuthUI);
      setAuthUI();

      const resizeHandle = document.getElementById('resize-handle');
      let isResizing = false;
      let startX, startY, startWidth, startHeight;

      if (resizeHandle) {
          resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = terminalArea.offsetWidth;
            startHeight = terminalArea.offsetHeight;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
          });
      }

      function handleResize(e) {
        if (!isResizing) return;
        const newWidth = Math.max(300, startWidth + (e.clientX - startX));
        const newHeight = Math.max(200, startHeight + (e.clientY - startY));
        terminalArea.style.width = newWidth + 'px';
        terminalArea.style.height = newHeight + 'px';
        if (fit) fit.fit();
      }

      function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
      }
      
      if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          fullscreenBtn.textContent = '⛶ Fullscreen';
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
      
      if (saveBtn) saveBtn.addEventListener('click', saveConnection);
      loadSaved();
      
      if (savedList) {
          savedList.addEventListener('change', () => {
            const idx = savedList.value;
            if (idx === '') return;
            const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
            const c = list[parseInt(idx, 10)];
            if (!c) return;
            form.host.value = c.host || '';
            form.port.value = c.port || '22';
            form.username.value = c.username || '';
            authSelect.value = c.auth || 'password';
            setAuthUI();
          });
      }
      
      if (form) form.addEventListener('submit', connect);
      if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);
      
      window.addEventListener('resize', () => { if(fit) fit.fit() });
  }

  function fallbackTerminal() {
    console.error('xterm.js or one of its addons failed to load');
    if (termEl) termEl.textContent = '\n[Terminal not available: xterm.js failed to load]\n';
    window.KeySocket = { connect: ()=>{}, disconnect: ()=>{}, terminal: {} };
  }

  function setAuthUI() {
    if (passwordLabel) passwordLabel.style.display = authSelect.value === 'password' ? '' : 'none';
    if (keyLabel) keyLabel.style.display = authSelect.value === 'key' ? '' : 'none';
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (terminalArea) terminalArea.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
      if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Exit Fullscreen';
    } else {
      document.exitFullscreen();
    }
  }

  function saveConnection() {
    const obj = {
      host: form.host.value,
      port: form.port.value,
      username: form.username.value,
      auth: authSelect.value
    };
    const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
    list.unshift(obj);
    localStorage.setItem('ks_connections', JSON.stringify(list.slice(0, 20)));
    loadSaved();
  }

  function loadSaved() {
    if (!savedList) return;
    const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
    savedList.innerHTML = '<option value="">Saved connections</option>' + list.map((c, i) => ` <option value="${i}">${c.username}@${c.host}:${c.port} (${c.auth})</option>`).join('\n');
  }

  function connect(e) {
    if (e) e.preventDefault();
    if (socket) return;
    
    initTurnstile(() => {
        if (!term) {
            console.error("Terminal is not initialized.");
            return;
        }
        term.clear();
        term.focus();

        const wsUrl = () => {
            const loc = window.location;
            const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${loc.host}/ssh?ts=${encodeURIComponent(ksTurnstileToken)}`;
        }

        socket = new WebSocket(wsUrl());
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
          const payload = {
            type: 'connect',
            host: form.host.value,
            port: form.port.value || 22,
            username: form.username.value,
            auth: authSelect.value
          };
          if (authSelect.value === 'password') payload.password = form.password.value;
          else payload.privateKey = privateKeyText || null;
          socket.send(JSON.stringify(payload));
          connectBtn.disabled = true;
          disconnectBtn.disabled = false;
        };
        
        socket.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === 'error') term.writeln(`\r\n[ERROR] ${msg.message}`);
              else if (msg.type === 'ready') term.writeln('\r\n[SSH Ready]');
              else if (msg.type === 'ssh-closed') term.writeln('\r\n[SSH Closed]');
            } catch (e) {
              term.writeln(`\r\n${ev.data}`);
            }
          } else {
            term.write(new Uint8Array(ev.data));
          }
        };

        socket.onclose = () => {
          term.writeln('\r\n[Disconnected]');
          socket = null;
          connectBtn.disabled = false;
          disconnectBtn.disabled = true;
        };
        
        socket.onerror = (err) => {
          term.writeln('\r\n[Socket error]');
          console.error('ws error', err);
        };
        
        term.onData((d) => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(d);
          }
        });
    });
  }

  function disconnect() {
    if (socket) {
      socket.close();
    }
  }
  
  function initVirtualKeyboard() {
    const container = document.querySelector('.keyboard-container');
    if (!container) return;

    const state = { shift: false, ctrl: false, layout: 'qwerty' };

    const keyLayouts = {
      qwerty: [
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
        [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'enter', code: 'Enter', flex: 2.5 }],
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: ',', shiftKey: '<', code: 'Comma', flex: 1 }, { key: '.', shiftKey: '>', code: 'Period', flex: 1 }, { key: '/', shiftKey: '?', code: 'Slash', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
      ],
      azerty: [
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '&', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: 'é', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '"', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '\'', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '(', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '-', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: 'è', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '_', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: 'ç', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: 'à', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
        [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: 'enter', code: 'Enter', flex: 1.5 }],
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: ',', shiftKey: '?', code: 'Comma', flex: 1 }, { key: ';', shiftKey: '.', code: 'Semicolon', flex: 1 }, { key: ':', shiftKey: '/', code: 'Colon', flex: 1 }, { key: '!', shiftKey: '§', code: 'Exclamation', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
      ],
      symbols: [
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: '[', shiftKey: '{', code: 'BracketLeft', flex: 1 }, { key: ']', shiftKey: '}', code: 'BracketRight', flex: 1 }, { key: ';', shiftKey: ':', code: 'Semicolon', flex: 1 }, { key: '\'', shiftKey: '"', code: 'Quote', flex: 1 }, { key: '=', shiftKey: '+', code: 'Equal', flex: 1 }, { key: '-', shiftKey: '_', code: 'Minus', flex: 1 }],
        [],
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }],
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'abc', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
      ]
    };

    const escapeCodes = {
      'Enter': '\r', 'Backspace': '\x7f', 'Tab': '\t', 'Escape': '\x1b', 'Space': ' ',
      'ArrowUp': '\x1b[A', 'ArrowDown': '\x1b[B', 'ArrowRight': '\x1b[C', 'ArrowLeft': '\x1b[D'
    };

    const sendToSocket = (data) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    };

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
        state.layout = (state.layout === 'qwerty' || state.layout === 'azerty') ? 'symbols' : 'qwerty';
        renderKeyboard();
        return;
      }
      if (code === 'Lang') {
        state.layout = state.layout === 'qwerty' ? 'azerty' : 'qwerty';
        renderKeyboard();
        return;
      }

      const dataToSend = escapeCodes[code] || char;
      if (dataToSend) {
        if (state.ctrl && char && char.length === 1) {
            const charCode = char.toUpperCase().charCodeAt(0);
            if (charCode >= 65 && charCode <= 90) { // A-Z
                sendToSocket(String.fromCharCode(charCode - 64));
            } else {
                sendToSocket(dataToSend);
            }
        } else {
            sendToSocket(dataToSend);
        }
      }

      if (state.shift) {
        state.shift = false;
        renderKeyboard();
      }
      if (state.ctrl) {
        state.ctrl = false;
        document.querySelector('[data-code="ControlLeft"]').classList.remove('keyboard-key--active');
      }
      term.focus();
    });

    function renderKeyboard() {
      const layout = keyLayouts[state.layout];
      container.innerHTML = layout.map(row => `
        <div class="keyboard-row">
          ${row.map(key => {
            const displayChar = state.shift ? (key.shiftKey || key.key.toUpperCase()) : key.key;
            const flex = key.flex || 1;
            let className = 'keyboard-key';
            if ((key.code === 'ShiftLeft' || key.code === 'ShiftRight') && state.shift) {
                className += ' keyboard-key--active';
            }
             if (key.code === 'ControlLeft' && state.ctrl) {
                className += ' keyboard-key--active';
            }
            
            return `<button class="${className}" style="flex-grow: ${flex}" data-code="${key.code}" data-key="${key.key}" data-shift-key="${key.shiftKey || ''}">${displayChar}</button>`;
          }).join('')}
        </div>
      `).join('');
    }
    renderKeyboard();
  }

  // --- Turnstile Functions ---
  function initTurnstile(callback) {
    if (!process.env.TURNSTILE_SECRET) {
        console.warn("Turnstile secret not set, skipping verification.");
        if (callback) callback();
        return;
    }
    
    const widgetEl = document.getElementById('turnstile-widget');
    const overlay = document.getElementById('turnstile-overlay');
    if (overlay) overlay.style.display = 'flex';

    const onToken = (token) => {
        ksTurnstileToken = token;
        if (overlay) overlay.style.display = 'none';
        if (widgetEl) widgetEl.innerHTML = '';
        if (callback) callback();
    };
    
    if (window.turnstile) {
        try {
            if(widgetEl) widgetEl.innerHTML = '';
            window.turnstile.render('#turnstile-widget', {
                sitekey: '0x4AAAAAACDdgapByiL54XqC',
                callback: onToken,
            });
        } catch (e) {
            console.error('Turnstile render error', e);
            if (overlay) overlay.style.display = 'none';
            if (callback) callback();
        }
    } else {
        console.error("Turnstile library not loaded.");
        if (overlay) overlay.style.display = 'none';
        if (callback) callback();
    }
  }

})();
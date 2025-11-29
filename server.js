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
        // Turnstile is implicitly handled before WebSocket connection now
      } else {
        showLoginView();
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      showLoginView();
    }
  }

  function showLoginView() {
    loginView.style.display = 'block';
    appView.style.display = 'none';
  }

  function showAppView(user) {
    loginView.style.display = 'none';
    appView.style.display = 'grid';

    userInfo.innerHTML = `
      <img src="${user.photo}" alt="User photo" title="${user.displayName}">
      <span>${user.displayName}</span>
      <a href="/logout">Logout</a>
    `;
    userInfo.style.display = 'flex';

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

      resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = terminalArea.offsetWidth;
        startHeight = terminalArea.offsetHeight;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
      });

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
      }
      
      fullscreenBtn.addEventListener('click', toggleFullscreen);
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          fullscreenBtn.textContent = '⛶ Fullscreen';
        }
      });
      
      keyfileInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => { privateKeyText = r.result; };
        r.readAsText(f);
      });
      
      saveBtn.addEventListener('click', saveConnection);
      loadSaved();
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
      
      form.addEventListener('submit', connect);
      disconnectBtn.addEventListener('click', disconnect);
      
      window.addEventListener('resize', () => { if(fit) fit.fit() });
  }

  function fallbackTerminal() {
    console.error('xterm.js or one of its addons failed to load');
    termEl.textContent = '\n[Terminal not available: xterm.js failed to load]\n';
    // Provide a stub for other functions to not crash
    window.KeySocket = { connect: ()=>{}, disconnect: ()=>{}, terminal: {} };
  }

  function setAuthUI() {
    passwordLabel.style.display = authSelect.value === 'password' ? '' : 'none';
    keyLabel.style.display = authSelect.value === 'key' ? '' : 'none';
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      terminalArea.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
      fullscreenBtn.textContent = '⛶ Exit Fullscreen';
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
    const list = JSON.parse(localStorage.getItem('ks_connections') || '[]');
    savedList.innerHTML = '<option value="">Saved connections</option>' + list.map((c, i) => ` <option value="${i}">${c.username}@${c.host}:${c.port} (${c.auth})</option>`).join('\n');
  }

  function connect(e) {
    if (e) e.preventDefault();
    if (socket) return;
    
    // Run turnstile verification right before connecting
    initTurnstile(() => {
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
      // The full virtual keyboard logic goes here...
  }

  // --- Turnstile Functions ---
  function initTurnstile(callback) {
    if (!TURNSTILE_SECRET) {
        console.warn("Turnstile secret not set, skipping verification.");
        if (callback) callback();
        return;
    }
    
    const widgetEl = document.getElementById('turnstile-widget');
    const overlay = document.getElementById('turnstile-overlay');
    overlay.style.display = 'flex';

    const onToken = (token) => {
        ksTurnstileToken = token;
        overlay.style.display = 'none';
        if (widgetEl) widgetEl.innerHTML = '';
        if (callback) callback();
    };
    
    if (window.turnstile) {
        try {
            widgetEl.innerHTML = '';
            window.turnstile.render('#turnstile-widget', {
                sitekey: '0x4AAAAAACDdgapByiL54XqC', // Replace with your site key
                callback: onToken,
            });
        } catch (e) {
            console.error('Turnstile render error', e);
            overlay.style.display = 'none';
            if (callback) callback();
        }
    } else {
        console.error("Turnstile library not loaded.");
        overlay.style.display = 'none';
        if (callback) callback();
    }
  }
})();
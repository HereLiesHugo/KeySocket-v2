/* Frontend: xterm.js + WebSocket bridge
 * - Saves connections to localStorage
 * - Supports password or private key (key uploaded and sent to backend)
 * NOTE: Sending private keys through the network has security implications.
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

  let term;
  let fit;
  if (Terminal && typeof Terminal === 'function') {
    term = new Terminal({ cursorBlink: true });
    if (FitAddon && (typeof FitAddon === 'function' || typeof FitAddon === 'object')) {
      try { fit = new (FitAddon.FitAddon || FitAddon)(); } catch (e) { fit = new FitAddon(); }
      try { term.loadAddon(fit); } catch (e) { /* ignore addon load errors */ }
    }
    try { term.open(termEl); } catch (e) { console.error('term.open failed', e); }
    try { if (fit && typeof fit.fit === 'function') fit.fit(); } catch (e) {}
  } else {
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
  }

  let socket = null;
  let privateKeyText = null;
  let ksTurnstileToken = null;
  let ksTurnstileVerifiedAt = 0;
  let ksTurnstileTTL = 0;
  let ksTurnstileWidgetId = null;
  let ksTurnstileRendered = false;

  function setAuthUI() {
    if (authSelect.value === 'password') {
      passwordLabel.style.display = '';
      keyLabel.style.display = 'none';
    } else {
      passwordLabel.style.display = 'none';
      keyLabel.style.display = '';
    }
  }

  authSelect.addEventListener('change', setAuthUI);
  setAuthUI();

  // Resize handle for terminal-area
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
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const newWidth = Math.max(300, startWidth + deltaX);
    const newHeight = Math.max(200, startHeight + deltaY);
    terminalArea.style.width = newWidth + 'px';
    terminalArea.style.height = newHeight + 'px';
    // Trigger terminal resize
    if (fit && typeof fit.fit === 'function') {
      try { fit.fit(); } catch (e) {}
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
      terminalArea.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
      fullscreenBtn.textContent = '⛶ Exit Fullscreen';
    } else {
      document.exitFullscreen();
      fullscreenBtn.textContent = '⛶ Fullscreen';
    }
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

  function wsUrl() {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = protocol + '//' + loc.host + '/ssh';
    if (ksTurnstileToken) url += '?ts=' + encodeURIComponent(ksTurnstileToken);
    return url;
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

  saveBtn.addEventListener('click', saveConnection);

  function connect(e) {
    if (e) e.preventDefault();
    if (socket) return;
    term.clear();
    term.focus();

    // ensure we have a fresh server-issued token
    const now = Date.now();
    if (!ksTurnstileToken || (ksTurnstileTTL && (now > (ksTurnstileVerifiedAt + ksTurnstileTTL - 2000)))) {
      // token missing or expired (with 2s safety margin) -> re-run Turnstile
      reRunTurnstile();
      term.writeln('\r\n[INFO] Turnstile token missing or expired; please complete verification.');
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
        auth: authSelect.value
      };
      if (authSelect.value === 'password') payload.password = form.password.value;
      else payload.privateKey = privateKeyText || null;

      socket.send(JSON.stringify(payload));
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
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
      term.writeln('\r\n[Disconnected]');
      socket = null;
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
    });

    socket.addEventListener('error', (err) => {
      term.writeln('\r\n[Socket error]');
      console.error('ws error', err);
    });

    term.onData((d) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      // send raw input as binary
      socket.send(new TextEncoder().encode(d));
    });

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
    const resizeObserver = new ResizeObserver(() => { doResize(); });
    resizeObserver.observe(terminalArea);
    setTimeout(sendResize, 250);
  }

  function disconnect() {
    if (!socket) return;
    try { socket.close(); } catch (e) {}
    socket = null;
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }

  form.addEventListener('submit', connect);
  disconnectBtn.addEventListener('click', disconnect);

  // Turnstile handling on site enter
  function onTurnstileToken(token) {
    if (!token) return;
    // send token to server for verification and one-time storage
    fetch('/turnstile-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).then(r => r.json()).then(j => {
      console.debug('turnstile verify response', j);
      if (j && j.ok && j.token) {
        // store the server-issued one-time token (do NOT keep the Cloudflare token)
        ksTurnstileToken = j.token;
        ksTurnstileTTL = parseInt(j.ttl || '30000', 10) || 30000;
        ksTurnstileVerifiedAt = Date.now();
        const ov = document.getElementById('turnstile-overlay');
        if (ov) ov.style.display = 'none';
        try { connectBtn.disabled = false; } catch (e) {}
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
      connectBtn.disabled = true;
      const widgetEl = document.getElementById('turnstile-widget');
      console.debug('initTurnstile:', { turnstile: !!window.turnstile, widgetEl });
      if (!widgetEl) {
        console.error('Turnstile widget container not found');
        connectBtn.disabled = false;
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
          widgetEl.innerHTML = `<div style="color:#b00">Failed to load verification widget.<br/><button id=\"turnstile-retry\">Retry</button></div>`;
          const btn = document.getElementById('turnstile-retry');
          if (btn) btn.addEventListener('click', () => { widgetEl.innerHTML = ''; initTurnstile(); });
          connectBtn.disabled = false;
        }
      } else {
        // turnstile library not loaded yet — attempt to load it dynamically and show helpful hint
        console.warn('Turnstile library not ready');
        widgetEl.innerHTML = `<div style="color:#b00">Verification library not loaded.<br/><div id=\"turnstile-load-status\">Attempting to load...</div><button id=\"turnstile-retry\">Retry</button></div>`;
        const statusEl = document.getElementById('turnstile-load-status');
        const btn2 = document.getElementById('turnstile-retry');
        const loadScript = () => {
          try {
            if (statusEl) statusEl.textContent = 'Loading Turnstile library...';
            // create script element to load the library (will respect CSP)
            const s = document.createElement('script');
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ksInitTurnstile&render=explicit';
            s.async = true; s.defer = true;
            s.onload = () => { if (statusEl) statusEl.textContent = 'Loaded, initializing...'; try { if (window.ksInitTurnstile) window.ksInitTurnstile(); } catch (e) {} };
            s.onerror = (ev) => { if (statusEl) statusEl.textContent = 'Failed to load library. Check console and network. CSP may be blocking external scripts.'; console.error('Turnstile script load error', ev); };
            document.head.appendChild(s);
            // give a timeout if nothing happens
            setTimeout(() => { if (!window.turnstile && statusEl && statusEl.textContent.indexOf('Failed') === -1) statusEl.textContent = 'Still loading — check network/CSP and retry.'; }, 4000);
          } catch (e) { console.error('dynamic load failed', e); if (statusEl) statusEl.textContent = 'Dynamic loader failed'; }
        };
        if (btn2) btn2.addEventListener('click', () => { widgetEl.innerHTML = ''; loadScript(); });
        // try once automatically
        loadScript();
        connectBtn.disabled = false;
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
          try { window.turnstile.reset(ksTurnstileWidgetId); } catch (e) { /* fallback */ ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken }); }
        } else {
          ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken });
        }
      }
    } catch (e) { console.error('reRunTurnstile', e); }
  }

  // initialize on DOM ready or when Cloudflare script loads
  function tryInitTurnstile() {
    if (window.turnstile) initTurnstile();
    else if (document.readyState === 'complete' || document.readyState === 'interactive') initTurnstile();
    else window.addEventListener('DOMContentLoaded', initTurnstile);
  }

  // expose callback for Cloudflare Turnstile onload
  window.ksInitTurnstile = initTurnstile;

  tryInitTurnstile();

  // expose minimal helpers
  window.KeySocket = { connect, disconnect, terminal: term };
})();

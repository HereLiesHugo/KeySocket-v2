/* Frontend: xterm.js + WebSocket bridge
 * - Saves connections to localStorage
 * - Supports password or private key (key uploaded and sent to backend)
 * NOTE: Sending private keys through the network has security implications.
 */
(function () {
  const { Terminal } = window.Terminal || window;
  const FitAddon = window.FitAddon && window.FitAddon.FitAddon ? window.FitAddon.FitAddon : window.FitAddon;

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

  const term = new Terminal({ cursorBlink: true });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(termEl);
  fit.fit();

  let socket = null;
  let privateKeyText = null;
  let ksTurnstileToken = null;
  let ksTurnstileVerifiedAt = 0;
  let ksTurnstileTTL = 0;
  let ksTurnstileWidgetId = null;

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

  window.addEventListener('resize', () => { try { fit.fit(); } catch (e) {} });

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
    window.addEventListener('resize', () => { fit.fit(); sendResize(); });
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
      if (j && j.ok && j.token) {
        // store the server-issued one-time token (do NOT keep the Cloudflare token)
        ksTurnstileToken = j.token;
        ksTurnstileTTL = parseInt(j.ttl || '30000', 10) || 30000;
        ksTurnstileVerifiedAt = Date.now();
        const ov = document.getElementById('turnstile-overlay');
        if (ov) ov.style.display = 'none';
        try { connectBtn.disabled = false; } catch (e) {}
      } else {
        // leave overlay visible and let user try again
        console.warn('Turnstile verify failed', j);
      }
    }).catch(err => console.error('turnstile verify error', err));
  }

  function initTurnstile() {
    try {
      // disable connect until verified
      connectBtn.disabled = true;
      if (window.turnstile && document.getElementById('turnstile-widget')) {
        // store widget id so we can reset/re-run the challenge later
        try { ksTurnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: '0x4AAAAAACDdgapByiL54XqC', callback: onTurnstileToken }); } catch (e) { console.error('turnstile render error', e); ksTurnstileWidgetId = null; }
      } else {
        console.warn('Turnstile library not ready or widget element missing');
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

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
    return protocol + '//' + loc.host + '/ssh';
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

  // expose minimal helpers
  window.KeySocket = { connect, disconnect, terminal: term };
})();

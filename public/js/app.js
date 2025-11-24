class SSHTerminalApp {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.savedConnections = [];
        this.currentConnectionId = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        
        this.init();
    }

    init() {
        this.loadSavedConnections();
        this.setupEventListeners();
        this.renderConnections();
        this.setupTheme();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.nav-item').dataset.tab));
        });

        // Connections
        document.getElementById('newConnectionBtn').addEventListener('click', () => this.openConnectionModal());
        
        // Modal
        const modal = document.getElementById('connectionModal');
        document.querySelector('.modal-close').addEventListener('click', () => this.closeConnectionModal());
        document.getElementById('modalCancelBtn').addEventListener('click', () => this.closeConnectionModal());
        document.getElementById('connectionForm').addEventListener('submit', (e) => this.handleConnectionSubmit(e));
        
        // Auth method toggle
        document.querySelectorAll('input[name="authMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleAuthMethod(e.target.value));
        });

        // Terminal
        document.getElementById('terminalInput').addEventListener('keydown', (e) => this.handleTerminalInput(e));
        document.getElementById('clearTerminalBtn').addEventListener('click', () => this.clearTerminal());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());

        // Settings
        document.getElementById('darkModeToggle').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        document.getElementById('fontSizeSelect').addEventListener('change', (e) => this.setFontSize(e.target.value));
        document.getElementById('historyLimitInput').addEventListener('change', (e) => this.setHistoryLimit(e.target.value));

        // Click outside modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeConnectionModal();
        });
    }

    setupTheme() {
        const darkMode = localStorage.getItem('darkMode') !== 'false';
        document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
        document.getElementById('darkModeToggle').checked = darkMode;

        const fontSize = localStorage.getItem('fontSize') || '14';
        document.getElementById('fontSizeSelect').value = fontSize;
        this.setFontSize(fontSize);
    }

    toggleDarkMode(enabled) {
        localStorage.setItem('darkMode', enabled);
        document.documentElement.style.colorScheme = enabled ? 'dark' : 'light';
    }

    setFontSize(size) {
        localStorage.setItem('fontSize', size);
        document.getElementById('terminalOutput').style.fontSize = size + 'px';
    }

    setHistoryLimit(limit) {
        localStorage.setItem('historyLimit', limit);
    }

    switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-panel`).classList.add('active');

        // Focus terminal input if switching to terminal
        if (tabName === 'terminal' && this.isConnected) {
            setTimeout(() => document.getElementById('terminalInput').focus(), 100);
        }
    }

    openConnectionModal() {
        document.getElementById('connectionModal').classList.add('open');
        document.getElementById('connName').focus();
    }

    closeConnectionModal() {
        document.getElementById('connectionModal').classList.remove('open');
        document.getElementById('connectionForm').reset();
        this.toggleAuthMethod('password');
    }

    toggleAuthMethod(method) {
        const passwordGroup = document.querySelector('.auth-password-group');
        const keyGroup = document.querySelector('.auth-key-group');
        
        if (method === 'password') {
            passwordGroup.style.display = 'flex';
            keyGroup.style.display = 'none';
        } else {
            passwordGroup.style.display = 'none';
            keyGroup.style.display = 'flex';
        }
    }

    handleConnectionSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('connName').value;
        const host = document.getElementById('connHost').value;
        const port = parseInt(document.getElementById('connPort').value) || 22;
        const username = document.getElementById('connUsername').value;
        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
        const remember = document.getElementById('connRemember').checked;

        const connection = {
            id: `${host}-${port}-${Date.now()}`,
            name,
            host,
            port,
            username,
            authMethod,
            password: authMethod === 'password' ? document.getElementById('connPassword').value : null,
            privateKey: authMethod === 'key' ? document.getElementById('connPrivateKey').value : null,
        };

        if (remember) {
            this.savedConnections.push(connection);
            this.saveSavedConnections();
        }

        this.connectToSSH(connection);
        this.closeConnectionModal();
    }

    connectToSSH(connection) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.initWebSocket();
        }

        this.currentConnectionId = connection.id;

        const connectMsg = {
            type: 'connect',
            host: connection.host,
            port: connection.port,
            username: connection.username,
        };

        if (connection.password) {
            connectMsg.password = connection.password;
        } else if (connection.privateKey) {
            connectMsg.privateKey = connection.privateKey;
        }

        this.ws.send(JSON.stringify(connectMsg));
        
        // Show terminal and update UI
        this.switchTab('terminal');
        document.getElementById('connectionInfo').textContent = `${connection.username}@${connection.host}:${connection.port}`;
    }

    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Disconnected', false);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateStatus('Disconnected', false);
            this.isConnected = false;
        };
    }

    handleWebSocketMessage(data) {
        const output = document.getElementById('terminalOutput');

        switch (data.type) {
            case 'connected':
                this.isConnected = true;
                this.updateStatus('Connected', true);
                output.textContent += `\n✓ ${data.message}\n\n`;
                output.scrollTop = output.scrollHeight;
                break;

            case 'output':
                output.textContent += data.data;
                output.scrollTop = output.scrollHeight;
                break;

            case 'error-output':
                output.textContent += `\x1b[31m${data.data}\x1b[0m`;
                output.scrollTop = output.scrollHeight;
                break;

            case 'error':
                output.textContent += `\n\x1b[31m[ERROR] ${data.message}\x1b[0m\n`;
                output.scrollTop = output.scrollHeight;
                this.updateStatus('Error', false);
                break;

            case 'disconnected':
                this.isConnected = false;
                this.updateStatus('Disconnected', false);
                output.textContent += '\n\nConnection closed.\n';
                output.scrollTop = output.scrollHeight;
                break;
        }
    }

    handleTerminalInput(e) {
        if (e.key === 'Enter') {
            const input = e.target.value.trim();
            
            if (input) {
                const output = document.getElementById('terminalOutput');
                output.textContent += `${document.getElementById('terminalPrompt').textContent}${input}\n`;
                output.scrollTop = output.scrollHeight;

                // Add to history
                this.commandHistory.unshift(input);
                const limit = parseInt(localStorage.getItem('historyLimit') || '100');
                this.commandHistory = this.commandHistory.slice(0, limit);
                this.historyIndex = -1;

                if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'command',
                        command: input
                    }));
                }
            }

            e.target.value = '';
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.historyIndex = Math.min(this.historyIndex + 1, this.commandHistory.length - 1);
            if (this.historyIndex >= 0) {
                e.target.value = this.commandHistory[this.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.historyIndex = Math.max(this.historyIndex - 1, -1);
            if (this.historyIndex >= 0) {
                e.target.value = this.commandHistory[this.historyIndex];
            } else {
                e.target.value = '';
            }
        }
    }

    clearTerminal() {
        document.getElementById('terminalOutput').textContent = '';
    }

    disconnect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'disconnect' }));
            this.ws.close();
        }
        this.isConnected = false;
        this.updateStatus('Disconnected', false);
        this.switchTab('connections');
    }

    updateStatus(text, connected) {
        document.getElementById('statusText').textContent = text;
        const dot = document.getElementById('statusDot');
        dot.classList.toggle('connected', connected);
    }

    renderConnections() {
        const grid = document.getElementById('connectionsGrid');
        grid.innerHTML = '';

        if (this.savedConnections.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-tertiary);">No saved connections. Create one to get started.</div>';
            return;
        }

        this.savedConnections.forEach(conn => {
            const card = document.createElement('div');
            card.className = 'connection-card';
            card.innerHTML = `
                <div class="connection-header">
                    <div class="connection-name">${this.escapeHtml(conn.name)}</div>
                    <div class="connection-status">Saved</div>
                </div>
                <div class="connection-details">
                    <div class="connection-detail-row">
                        <span>Host:</span>
                        <span>${this.escapeHtml(conn.host)}:${conn.port}</span>
                    </div>
                    <div class="connection-detail-row">
                        <span>User:</span>
                        <span>${this.escapeHtml(conn.username)}</span>
                    </div>
                    <div class="connection-detail-row">
                        <span>Auth:</span>
                        <span>${conn.authMethod === 'password' ? 'Password' : 'Private Key'}</span>
                    </div>
                </div>
                <div class="connection-actions">
                    <button class="btn btn-primary" onclick="app.handleQuickConnect('${conn.id}')">Connect</button>
                    <button class="btn btn-secondary" onclick="app.handleDeleteConnection('${conn.id}')">Delete</button>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    handleQuickConnect(connId) {
        const conn = this.savedConnections.find(c => c.id === connId);
        if (conn) {
            this.connectToSSH(conn);
        }
    }

    handleDeleteConnection(connId) {
        this.savedConnections = this.savedConnections.filter(c => c.id !== connId);
        this.saveSavedConnections();
        this.renderConnections();
    }

    saveSavedConnections() {
        // Only save non-sensitive data
        const safe = this.savedConnections.map(c => ({
            id: c.id,
            name: c.name,
            host: c.host,
            port: c.port,
            username: c.username,
            authMethod: c.authMethod
        }));
        localStorage.setItem('savedConnections', JSON.stringify(safe));
    }

    loadSavedConnections() {
        try {
            const saved = localStorage.getItem('savedConnections');
            if (saved) {
                this.savedConnections = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load saved connections:', e);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SSHTerminalApp();
});

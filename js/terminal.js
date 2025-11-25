// Terminal initialization
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Courier New', monospace",
    theme: {
        background: 'rgba(0, 0, 0, 0.8)',
        foreground: '#00ff00',
        cursor: '#00ff00',
    },
});

let socket = null;
let isConnected = false;

const connectionPanel = document.getElementById('connectionPanel');
const terminalWrapper = document.getElementById('terminalWrapper');
const connectionForm = document.getElementById('connectionForm');
const disconnectBtn = document.getElementById('disconnectBtn');
const authMethodRadios = document.querySelectorAll('input[name="authMethod"]');
const passwordGroup = document.getElementById('passwordGroup');
const keyGroup = document.getElementById('keyGroup');
const connectionInfo = document.getElementById('connectionInfo');
const savedConnectionsSelect = document.getElementById('savedConnections');
const loadBtn = document.getElementById('loadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');

const STORAGE_KEY = 'keysocket_connections';

// ===== LocalStorage Functions =====

function getSavedConnections() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return {};
    }
}

function saveConnectionToStorage(name, connectionData) {
    try {
        const connections = getSavedConnections();
        connections[name] = connectionData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
        refreshSavedConnectionsList();
        showNotification(`Connection "${name}" saved successfully!`);
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        showNotification('Failed to save connection (localStorage full?)', 'error');
    }
}

function deleteConnectionFromStorage(name) {
    try {
        const connections = getSavedConnections();
        delete connections[name];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
        refreshSavedConnectionsList();
        savedConnectionsSelect.value = '';
        showNotification(`Connection "${name}" deleted.`);
    } catch (error) {
        console.error('Error deleting from localStorage:', error);
        showNotification('Failed to delete connection', 'error');
    }
}

function loadConnectionFromStorage(name) {
    try {
        const connections = getSavedConnections();
        const data = connections[name];
        
        if (!data) {
            showNotification('Connection not found', 'error');
            return;
        }

        // Populate form fields
        document.getElementById('host').value = data.host || '';
        document.getElementById('port').value = data.port || '22';
        document.getElementById('username').value = data.username || '';
        document.getElementById('connectionName').value = name || '';

        // Set authentication method
        const authMethod = data.authMethod || 'password';
        document.querySelector(`input[name="authMethod"][value="${authMethod}"]`).checked = true;
        updateAuthMethodDisplay();

        // Populate credentials
        if (authMethod === 'password') {
            document.getElementById('password').value = data.password || '';
        } else {
            document.getElementById('privateKey').value = data.privateKey || '';
        }

        showNotification(`Loaded "${name}" connection`);
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        showNotification('Failed to load connection', 'error');
    }
}

function refreshSavedConnectionsList() {
    try {
        const connections = getSavedConnections();
        const names = Object.keys(connections).sort();

        // Clear existing options (except the placeholder)
        while (savedConnectionsSelect.options.length > 1) {
            savedConnectionsSelect.remove(1);
        }

        // Add saved connections
        names.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            savedConnectionsSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error refreshing connections list:', error);
    }
}

function showNotification(message, type = 'success') {
    // Create a simple toast notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#ff3333' : '#00ff00'};
        color: ${type === 'error' ? '#fff' : '#000'};
        border-radius: 4px;
        font-family: "Jersey 10", sans-serif;
        font-size: 0.95em;
        z-index: 1000;
        box-shadow: 0 0 15px ${type === 'error' ? 'rgba(255, 51, 51, 0.5)' : 'rgba(0, 255, 0, 0.5)'};
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== Event Listeners =====

// Toggle between password and key authentication
authMethodRadios.forEach((radio) => {
    radio.addEventListener('change', updateAuthMethodDisplay);
});

function updateAuthMethodDisplay() {
    const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
    if (authMethod === 'password') {
        passwordGroup.style.display = 'flex';
        keyGroup.style.display = 'none';
    } else {
        passwordGroup.style.display = 'none';
        keyGroup.style.display = 'flex';
    }
}

// Load button
loadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const selectedName = savedConnectionsSelect.value;
    if (selectedName) {
        loadConnectionFromStorage(selectedName);
    } else {
        showNotification('Please select a connection to load', 'error');
    }
});

// Delete button
deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const selectedName = savedConnectionsSelect.value;
    if (selectedName) {
        if (confirm(`Delete connection "${selectedName}"?`)) {
            deleteConnectionFromStorage(selectedName);
        }
    } else {
        showNotification('Please select a connection to delete', 'error');
    }
});

// Save button
saveBtn.addEventListener('click', (e) => {
    e.preventDefault();

    const connectionName = document.getElementById('connectionName').value.trim();
    if (!connectionName) {
        showNotification('Please enter a connection name', 'error');
        return;
    }

    const host = document.getElementById('host').value;
    const port = document.getElementById('port').value;
    const username = document.getElementById('username').value;
    const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
    const password = document.getElementById('password').value;
    const privateKey = document.getElementById('privateKey').value;

    if (!host || !port || !username) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (authMethod === 'password' && !password) {
        showNotification('Please enter a password', 'error');
        return;
    }

    if (authMethod === 'key' && !privateKey) {
        showNotification('Please provide a private key', 'error');
        return;
    }

    const connectionData = {
        host,
        port,
        username,
        authMethod,
    };

    if (authMethod === 'password') {
        connectionData.password = password;
    } else {
        connectionData.privateKey = privateKey;
    }

    const connections = getSavedConnections();
    if (connections[connectionName]) {
        if (!confirm(`Overwrite existing connection "${connectionName}"?`)) {
            return;
        }
    }

    saveConnectionToStorage(connectionName, connectionData);
});

// Handle form submission for connecting
connectionForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const host = document.getElementById('host').value;
    const port = document.getElementById('port').value;
    const username = document.getElementById('username').value;
    const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
    const password = document.getElementById('password').value;
    const privateKey = document.getElementById('privateKey').value;

    if (!host || !port || !username) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (authMethod === 'password' && !password) {
        showNotification('Please enter a password', 'error');
        return;
    }

    if (authMethod === 'key' && !privateKey) {
        showNotification('Please provide a private key', 'error');
        return;
    }

    // Hide form and show terminal
    connectionPanel.style.display = 'none';
    terminalWrapper.style.display = 'flex';

    term.open(document.getElementById('terminal'));
    term.write('Connecting...\r\n');
    connectionInfo.textContent = `Connected to ${username}@${host}:${port}`;

    // Connect to WebSocket server
    socket = new WebSocket('ws://localhost:3001');

    socket.onopen = () => {
        console.log('WebSocket connected');

        // Send connection credentials to server
        const connectionData = {
            type: 'connect',
            host,
            port,
            username,
        };

        if (authMethod === 'password') {
            connectionData.password = password;
        } else {
            connectionData.privateKey = privateKey;
        }

        socket.send(JSON.stringify(connectionData));
    };

    // Handle incoming messages
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'welcome') {
                term.write(data.message);
            } else if (data.type === 'output') {
                term.write(data.data);
            } else if (data.type === 'error') {
                term.write(`\x1b[31m${data.message}\x1b[0m`); // Red text for errors
                setTimeout(() => {
                    disconnectAndReset();
                }, 2000);
            } else if (data.type === 'connected') {
                term.write(data.message);
                isConnected = true;
            } else if (data.type === 'disconnected') {
                term.write(data.message);
                isConnected = false;
                setTimeout(() => {
                    disconnectAndReset();
                }, 1000);
            }
        } catch (error) {
            console.error('Message parsing error:', error);
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        term.write('\x1b[31mConnection error\x1b[0m\r\n');
    };

    socket.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected = false;
    };
});

// Send terminal input to server
term.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN && isConnected) {
        socket.send(JSON.stringify({ type: 'command', command: data }));
    }
});

// Handle disconnect button
disconnectBtn.addEventListener('click', () => {
    if (socket) {
        socket.send(JSON.stringify({ type: 'disconnect' }));
        socket.close();
    }
    disconnectAndReset();
});

function disconnectAndReset() {
    if (socket) {
        socket.close();
        socket = null;
    }
    isConnected = false;

    // Hide terminal and show form
    terminalWrapper.style.display = 'none';
    connectionPanel.style.display = 'flex';

    // Clear terminal
    if (term) {
        term.clear();
    }

    // Reset form
    connectionForm.reset();
    passwordGroup.style.display = 'flex';
    keyGroup.style.display = 'none';
}

// Initialize: Refresh saved connections list on page load
window.addEventListener('DOMContentLoaded', () => {
    refreshSavedConnectionsList();
});

// Add CSS for notification animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

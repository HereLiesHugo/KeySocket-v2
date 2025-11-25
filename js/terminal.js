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

// Toggle between password and key authentication
authMethodRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'password') {
            passwordGroup.style.display = 'flex';
            keyGroup.style.display = 'none';
        } else {
            passwordGroup.style.display = 'none';
            keyGroup.style.display = 'flex';
        }
    });
});

// Handle form submission
connectionForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const host = document.getElementById('host').value;
    const port = document.getElementById('port').value;
    const username = document.getElementById('username').value;
    const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
    const password = document.getElementById('password').value;
    const privateKey = document.getElementById('privateKey').value;

    if (!host || !port || !username) {
        alert('Please fill in all required fields');
        return;
    }

    if (authMethod === 'password' && !password) {
        alert('Please enter a password');
        return;
    }

    if (authMethod === 'key' && !privateKey) {
        alert('Please provide a private key');
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

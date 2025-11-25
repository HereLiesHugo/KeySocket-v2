const WebSocket = require("ws");
const { Client } = require("ssh2");
const fs = require("fs");
const path = require("path");

const wss = new WebSocket.Server({ port: 3001 });

// Map to store SSH connections per client
const clientConnections = new Map();

wss.on("connection", (ws) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    console.log(`Client connected: ${clientId}`);

    ws.send(JSON.stringify({ type: "welcome", message: "Welcome to Keysocket!\r\n" }));

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "connect") {
                handleSSHConnection(clientId, ws, data);
            } else if (data.type === "command") {
                handleCommand(clientId, ws, data.command);
            } else if (data.type === "disconnect") {
                handleDisconnect(clientId, ws);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
            ws.send(JSON.stringify({ type: "error", message: "Invalid message format\r\n" }));
        }
    });

    ws.on("close", () => {
        console.log(`Client disconnected: ${clientId}`);
        handleDisconnect(clientId, ws);
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        handleDisconnect(clientId, ws);
    });
});

function handleSSHConnection(clientId, ws, data) {
    const { host, port, username, password, privateKey } = data;

    // Validate input
    if (!host || !port || !username) {
        ws.send(JSON.stringify({ type: "error", message: "Missing connection parameters\r\n" }));
        return;
    }

    const sshClient = new Client();

    const connectionConfig = {
        host,
        port: parseInt(port),
        username,
        readyTimeout: 30000,
    };

    // Use password or private key
    if (privateKey) {
        try {
            connectionConfig.privateKey = privateKey;
        } catch (error) {
            ws.send(JSON.stringify({ type: "error", message: `Invalid private key: ${error.message}\r\n` }));
            return;
        }
    } else if (password) {
        connectionConfig.password = password;
    } else {
        ws.send(JSON.stringify({ type: "error", message: "No authentication method provided\r\n" }));
        return;
    }

    sshClient.on("ready", () => {
        console.log(`SSH connection ready for ${clientId}`);
        ws.send(JSON.stringify({ type: "connected", message: `Connected to ${host}\r\n` }));

        // Open shell
        sshClient.shell((error, stream) => {
            if (error) {
                ws.send(JSON.stringify({ type: "error", message: `Failed to open shell: ${error.message}\r\n` }));
                sshClient.end();
                return;
            }

            // Store the connection and stream
            clientConnections.set(clientId, { sshClient, stream, ws });

            // Send data from SSH server to WebSocket client
            stream.on("data", (data) => {
                ws.send(JSON.stringify({ type: "output", data: data.toString() }));
            });

            stream.on("close", () => {
                console.log(`Stream closed for ${clientId}`);
                handleDisconnect(clientId, ws);
            });

            stream.on("error", (error) => {
                console.error(`Stream error for ${clientId}:`, error);
                ws.send(JSON.stringify({ type: "error", message: `Stream error: ${error.message}\r\n` }));
            });
        });
    });

    sshClient.on("error", (error) => {
        console.error(`SSH connection error for ${clientId}:`, error);
        ws.send(JSON.stringify({ type: "error", message: `Connection failed: ${error.message}\r\n` }));
        clientConnections.delete(clientId);
    });

    sshClient.on("close", () => {
        console.log(`SSH connection closed for ${clientId}`);
        clientConnections.delete(clientId);
    });

    console.log(`Attempting SSH connection: ${username}@${host}:${port}`);
    sshClient.connect(connectionConfig);
}

function handleCommand(clientId, ws, command) {
    const connection = clientConnections.get(clientId);

    if (!connection) {
        ws.send(JSON.stringify({ type: "error", message: "Not connected to SSH server\r\n" }));
        return;
    }

    const { stream } = connection;

    try {
        stream.write(command);
    } catch (error) {
        console.error(`Command execution error for ${clientId}:`, error);
        ws.send(JSON.stringify({ type: "error", message: `Command error: ${error.message}\r\n` }));
    }
}

function handleDisconnect(clientId, ws) {
    const connection = clientConnections.get(clientId);

    if (connection) {
        const { sshClient, stream } = connection;

        if (stream) {
            stream.end();
        }

        if (sshClient) {
            sshClient.end();
        }

        clientConnections.delete(clientId);
        console.log(`Connection cleaned up for ${clientId}`);
    }

    try {
        ws.send(JSON.stringify({ type: "disconnected", message: "Disconnected from SSH server\r\n" }));
    } catch (error) {
        // WebSocket might already be closed
    }
}

const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3001 });

wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.send("Welcome to Keysocket!\r\n");

    ws.on("message", (msg) => {
        // Echo back for testing
        ws.send("You typed: " + msg);
    });
});

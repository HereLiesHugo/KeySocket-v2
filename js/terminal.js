// No require() in the browser — Terminal is global when loaded from <script>
const term = new Terminal({
    cursorBlink: true,
});

term.open(document.getElementById("terminal"));
term.write("Connecting...\r\n");

// Connect to WebSocket server
const socket = new WebSocket("ws://localhost:3001");

// Data from server → terminal
socket.onmessage = (event) => {
    term.write(event.data);
};

// Terminal input → server
term.onData((data) => {
    socket.send(data);
});

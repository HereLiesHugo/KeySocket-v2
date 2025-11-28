# KeySocket — Web SSH gateway (xterm.js)

This repository contains a minimal production-ready web SSH gateway using xterm.js for the browser and `ssh2` + `ws` on the server. It is prepared for deployment at the domain `keysocket.eu`.

https://keysocket.eu/

Important: forwarding private keys or passwords through the gateway has security implications. Prefer running this service behind a secure reverse proxy (Nginx) with TLS, and read the deployment notes below.

Quick start (development)

1. Copy `.env.example` to `.env` and edit if needed.
2. Install dependencies and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`.

Production deploy notes (keysocket.eu)

- Recommended: run behind an Nginx reverse proxy that terminates TLS for `keysocket.eu` and proxies `/ssh` WebSocket connections to the internal port (3000). This keeps Node behind a hardened proxy and allows easy LetsEncrypt automation.
- Alternatively set `USE_TLS=true` and configure `TLS_KEY` and `TLS_CERT` to point to your certificate and key (e.g. from certbot). Running Node directly with TLS is supported but less flexible.

Systemd unit example (behind proxy):

```ini
[Unit]
Description=KeySocket Web SSH Gateway
After=network.target

[Service]
Environment=NODE_ENV=production
WorkingDirectory=/srv/keysocket
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

Reverse proxy (Nginx) snippet for websockets:

```nginx
server {
  server_name keysocket.eu;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Security & hardening

- Use `ALLOWED_HOSTS` in `.env` to restrict which destination hosts users may connect to.
- Keep the server behind a firewall and use strong rate limits.
- Consider additional authentication (login to the web UI) before allowing arbitrary SSH connections.

Features implemented

- xterm.js based terminal in the browser
- WebSocket `/ssh` bridge to the SSH server using `ssh2`
- Password or private-key auth (client may upload a key which is forwarded to the server)
- Saved connections in `localStorage`
- Basic production hardening: `helmet`, `express-rate-limit`, logging, optional TLS

Limitations & next steps

- No user authentication for the web UI — add OAuth / session login for multi-user deployments.
- Sending private keys through the network is risky — implement client-side encryption or server-side key storage if required.
- Add auditing/logging of sessions if you need compliance.

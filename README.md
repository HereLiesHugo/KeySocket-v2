# KeySocket v2 - Modern SSH Terminal Application

A web-based SSH terminal client with modern UI, built with Node.js and deployable to nginx servers.

## Features

- 🌐 **Web-based SSH Client** - Access SSH servers directly from your browser
- 🎨 **Modern Dark UI** - Beautiful, responsive interface with gradient accents
- 💾 **Connection Management** - Save and manage multiple SSH connections
- ⌨️ **Full Terminal Support** - Execute commands and view output in real-time
- 🔐 **Multiple Auth Methods** - Support for password and private key authentication
- 📱 **Responsive Design** - Works on desktop and mobile devices
- ⚙️ **Customizable** - Theme, font size, and command history settings
- 🔄 **WebSocket Communication** - Real-time bidirectional communication with SSH servers

## Project Structure

```
KeySocket-v2/
├── public/                 # Static frontend files
│   ├── index.html         # Main HTML file
│   ├── css/
│   │   └── style.css      # Modern styling with CSS variables
│   └── js/
│       └── app.js         # Frontend application logic
├── nginx/                 # Nginx configuration files
│   └── keysocket.conf     # Production nginx config
├── server.js              # Node.js WebSocket server
├── package.json           # Project dependencies
└── README.md             # This file
```

## Installation

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Nginx (for production deployment)

### Local Development

1. **Clone the repository:**
```bash
git clone https://github.com/HereLiesHugo/KeySocket-v2.git
cd KeySocket-v2
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment file:**
```bash
cp .env.example .env
```

4. **Start the development server:**
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### Creating a Connection

1. Click **"+ New Connection"** button
2. Fill in connection details:
   - **Connection Name**: A friendly name for this connection
   - **Host**: SSH server hostname or IP address
   - **Port**: SSH port (default: 22)
   - **Username**: SSH username
   - **Authentication**: Choose password or private key
3. Optionally check **"Save this connection"** to store it locally
4. Click **Connect**

### Using the Terminal

- Type commands and press **Enter** to execute
- Use **↑/↓** arrow keys to navigate command history
- Click **Clear** to clear terminal output
- Click **Disconnect** to close the SSH connection

### Settings

- **Dark Mode**: Toggle dark/light theme (dark is default)
- **Font Size**: Adjust terminal font size (12px - 18px)
- **Command History**: Set maximum number of commands to remember

## Deployment

### Prerequisites for Production

- Nginx server
- Node.js with PM2 or systemd
- SSL/TLS certificate (recommended)

### Nginx Configuration

Place the following configuration in `/etc/nginx/sites-available/keysocket`:

```nginx
upstream keysocket {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;

    # Redirect to HTTPS (recommended)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_vary on;

    # WebSocket and static files
    location / {
        proxy_pass http://keysocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/keysocket /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Start the Application

**Using PM2:**

```bash
npm install -g pm2
pm2 start server.js --name "keysocket"
pm2 startup
pm2 save
```

**Using systemd:**

Create `/etc/systemd/system/keysocket.service`:

```ini
[Unit]
Description=KeySocket SSH Terminal
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/KeySocket-v2
ExecStart=/usr/bin/node /path/to/KeySocket-v2/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable keysocket
sudo systemctl start keysocket
```

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=production
ALLOWED_HOSTS=yourdomain.com,api.yourdomain.com
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Always use HTTPS** in production with valid SSL certificates
2. **Use strong passwords** for SSH connections
3. **Private keys are NOT stored** - they're only used during connection
4. **WebSocket should be secured** (WSS) in production
5. **Validate and sanitize** all user inputs
6. **Keep dependencies updated** - regularly run `npm audit fix`
7. **Use firewall rules** to restrict access to the application
8. **Implement authentication** for production environments (consider OAuth2)

## API Reference

### WebSocket Messages

#### Connect to SSH Server
```json
{
    "type": "connect",
    "host": "example.com",
    "port": 22,
    "username": "user",
    "password": "pass"
}
```

#### Execute Command
```json
{
    "type": "command",
    "command": "ls -la"
}
```

#### Disconnect
```json
{
    "type": "disconnect"
}
```

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Connection Fails
- Check hostname/IP address is correct
- Verify SSH port is accessible
- Ensure username exists on the server
- Check firewall rules

### WebSocket Connection Issues
- Verify nginx is proxying WebSocket correctly
- Check browser console for errors (F12)
- Ensure HTTPS/WSS is used in production
- Check nginx logs: `sudo tail -f /var/log/nginx/error.log`

### Terminal Not Responding
- Reload the page (F5)
- Try disconnecting and reconnecting
- Check server.js logs for errors

## Development

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Code Structure

- **Frontend**: Vanilla JavaScript (no frameworks for minimal bundle size)
- **Backend**: Express.js with ws for WebSocket
- **SSH**: ssh2 library for SSH protocol implementation
- **Styling**: Modern CSS with custom properties (variables)

## Future Enhancements

- [ ] File transfer (SCP/SFTP)
- [ ] Session recording and playback
- [ ] User authentication and access control
- [ ] SSH key pair generation
- [ ] Port forwarding support
- [ ] Shell detection and customization
- [ ] Theme marketplace
- [ ] REST API for remote management

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.

---

**Note**: This is a web-based terminal interface. For maximum security in production environments, consider implementing additional authentication layers and access controls.

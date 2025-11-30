# KeySocket: A Secure Web SSH Gateway

## Support

If you find this project useful, please consider supporting its development:
- **Website:** [maturqu.com](https://maturqu.com)
- **Ko-fi:** [Support on Ko-fi](https://ko-fi.com/maturqu)

## Website:
### https://keysocket.eu - Landing Page
### https://keysocket.eu/console - Console

I thought there weren't enough free web ssh clients.
So here, a free web ssh client with modern styling.

Here's the boring version:

KeySocket is a web-based SSH client designed for secure and convenient access to remote terminals from any modern browser. It provides a clean, responsive interface powered by xterm.js and a robust Node.js backend.

The primary goal of this project is to offer a secure alternative to traditional desktop SSH clients, with a focus on usability for both desktop and mobile devices.

## Core Features

- **Web-Based Terminal:** A full-featured terminal emulator in the browser, powered by xterm.js with WebGL rendering for high performance.
- **Secure Authentication:** All sessions are protected by mandatory Google OAuth 2.0 with Cloudflare Turnstile verification, ensuring that only authenticated users can access the gateway.
- **Flexible SSH Authentication:** Supports both password and private key-based authentication for connecting to remote hosts, with optional passphrase support for encrypted keys.
- **Client-Side Key Handling:** Private keys are handled exclusively in the browser's memory and are never stored on the server, providing a clear security boundary.
- **Mobile-First Design:** Includes a responsive on-screen keyboard with QWERTY, AZERTY, and symbol layouts, making it fully usable on tablets and phones.
- **Customizable Terminal:** The terminal window is fully resizable with drag handles and includes a fullscreen mode for an immersive experience.
- **Connection Management:** Users can save frequently used connection details (host, port, user) to their browser's local storage for quick access.
- **Built-in Security:** The application is hardened with rate-limiting, a strict Content Security Policy (CSP), and secure WebSocket session handling.
- **Theme System:** Multiple built-in themes including Dark, Darker, Light, Monokai, Dracula, and Solarized (both light and dark variants).
- **App Management Interface:** Comprehensive settings panel for managing saved connections and customizing the interface appearance.
- **Responsive Design:** Fully responsive layout that adapts seamlessly to desktop, tablet, and mobile devices.
- **Terminal Resizing:** Dynamic terminal resizing with proper SSH terminal size synchronization.
- **Session Persistence:** Maintains user preferences and saved connections in browser local storage.
- **Real-time Feedback:** Visual feedback for authentication status, connection states, and error messages via non-intrusive UI banners.

## Security Model

Security is a primary consideration in KeySocket's design.

- **User Authentication:** Access to the gateway is restricted to users who have authenticated via Google OAuth with Cloudflare Turnstile verification for bot protection. Anonymous connection attempts are not possible.
- **WebSocket Security:** WebSocket connections are tightly integrated with the Express.js session middleware. Only authenticated users with a valid session can establish a WebSocket connection.
- **Rate Limiting:** The server implements strict rate-limiting on all HTTP requests to prevent brute-force attacks and other abuse.
- **Content Security Policy:** A strict CSP is enforced to prevent XSS attacks and ensure secure resource loading.
- **Client-Side Private Keys:** To prevent the server from becoming a high-value target for key theft, private keys are never sent to or stored on the server. They are loaded into the browser's memory for the duration of the connection attempt only. Optional passphrase support for encrypted keys is available, with passphrases never stored.
- **Request Size Limits:** Configurable limits for request payloads and private key sizes to prevent resource exhaustion attacks.

## User Interface & Experience

KeySocket provides a modern, intuitive interface designed for both technical and non-technical users.

### Interface Features
- **Responsive Design:** Seamlessly adapts to desktop, tablet, and mobile screen sizes
- **Drag-to-Resize Terminal:** Resize the terminal window by dragging the corner handle
- **Fullscreen Mode:** Immersive terminal experience with fullscreen toggle
- **Virtual Keyboard:** On-screen keyboard with multiple layouts (QWERTY, AZERTY, symbols) for mobile devices
- **Theme Customization:** Choose from 7 pre-built themes or use the system default
- **Settings Panel:** Centralized app management interface for connections and preferences
- **UI Feedback Banners:** Non-intrusive status banners for connection progress, success, and errors

### Available Themes
- **Dark:** Default dark theme with blue accents
- **Darker:** High-contrast dark theme for low-light environments
- **Light:** Clean light theme for daytime use
- **Monokai:** Popular dark theme inspired by the Monokai color scheme
- **Dracula:** Dark theme based on the Dracula color palette
- **Solarized Dark:** Eye-friendly dark theme with reduced blue light
- **Solarized Light:** Light variant of the Solarized theme

### Connection Management
- **Save Connections:** Store frequently used SSH connections in browser local storage
- **Quick Access:** Dropdown menu for instant connection to saved hosts
- **Edit & Delete:** Manage saved connections through the settings panel
- **Auto-complete:** Host and username suggestions from saved connections
- **Optional Key Passphrase:** Support for encrypted SSH keys with optional passphrase entry

## Getting Started

### Prerequisites

- Node.js (v16 or newer recommended)
- A Google account for creating OAuth 2.0 credentials

### Installation and Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/HereLiesHugo/KeySocket-v2.git
    cd KeySocket-v2
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create Google OAuth Credentials:**
    - Go to the [Google Cloud Platform Console](https://console.cloud.google.com/).
    - Create a new project.
    - Navigate to "APIs & Services" > "Credentials".
    - Click "Create Credentials" > "OAuth client ID".
    - Select "Web application" as the application type.
    - Under "Authorized redirect URIs", add your application's callback URL. For local development, this is `http://localhost:3000/auth/google/callback`.
    - Copy the generated "Client ID" and "Client Secret".

4.  **Configure Environment Variables:**
    - Copy the `.env.example` file to a new file named `.env`:
      ```bash
      cp .env.example .env
      ```
    - Open the `.env` file and fill in the required values:
      ```
      # Server Configuration
      HOST=0.0.0.0
      PORT=3000
      NODE_ENV=production
      
      # TLS Configuration (optional, if Node handles TLS)
      USE_TLS=false
      TLS_KEY=/etc/letsencrypt/live/keysocket.eu/privkey.pem
      TLS_CERT=/etc/letsencrypt/live/keysocket.eu/fullchain.pem
      
      # Cloudflare Turnstile (bot protection)
      TURNSTILE_SECRET="your_cloudflare_secret_key"
      TURNSTILE_SITEKEY="your_cloudflare_site_key"
      TURNSTILE_TOKEN_TTL_MS=30000
      
      # Google OAuth Credentials
      GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
      GOOGLE_CLIENT_SECRET="your_client_secret"
      
      # Session Security
      SESSION_SECRET="set-this-to-a-random-uuid"
      
      # Application URL (important for OAuth redirects)
      APP_BASE_URL="https://your-domain.com" // or http://localhost:3000 for development
      
      # Security & Performance Limits
      RATE_LIMIT=120                    # Requests per minute per IP
      CONCURRENT_PER_IP=5              # Maximum concurrent connections per IP
      MAX_PRIVATEKEY_SIZE=65536        # Maximum private key file size in bytes
      ALLOWED_HOSTS=                   # Optional: comma-separated allowed hosts
      ```

### Running the Application

-   **For development:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3000`.

-   **For production:**
    It is highly recommended to run the application behind a reverse proxy like Nginx that can handle TLS termination and provide an additional layer of security.
    ```bash
    npm start
    ```

## Technical Architecture

### Backend Stack
- **Node.js:** JavaScript runtime for the server
- **Express.js:** Web framework for HTTP routing and middleware
- **Socket.IO (WebSocket):** Real-time bidirectional communication for terminal I/O
- **SSH2:** Pure JavaScript SSH2 client library
- **Passport.js:** Authentication middleware for Google OAuth 2.0
- **Express Session:** Session management with secure cookies
- **Helmet:** Security middleware for setting HTTP headers
- **Express Rate Limit:** Rate limiting middleware for DDoS protection
- **Morgan:** HTTP request logger

### Frontend Stack
- **xterm.js:** Terminal emulator component with WebGL rendering
- **xterm-addon-fit:** Terminal resize addon
- **xterm-addon-webgl:** WebGL renderer for high-performance terminal
- **Vanilla JavaScript:** No frontend framework dependencies
- **CSS3:** Modern styling with CSS custom properties for theming

### Security Features
- **Content Security Policy:** Prevents XSS and code injection attacks
- **Rate Limiting:** Configurable request limits per IP address
- **Session Security:** Secure, HTTP-only cookies with proper expiration
- **Request Validation:** Input validation and size limits
- **WebSocket Authentication:** Only authenticated users can establish SSH connections

## Production Deployment

### Recommended Setup
For production use, it is highly recommended to deploy KeySocket behind a reverse proxy with proper TLS termination.

### Nginx Configuration Example
A complete nginx configuration with security headers, SSL, and extensionless URL support is included in the repository as `keysocket.eu`. Key features include:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

# Main HTTPS server block
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration (Certbot managed)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Content Security Policy for Cloudflare Turnstile compatibility
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss: https://cloudflareinsights.com https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com;" always;
    
    # Extensionless URL support
    location ~ ^/(console|index)\.html$ {
        return 301 /$1;
    }
    
    # Console page proxy
    location = /console {
        proxy_pass http://127.0.0.1:3000/console.html;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Content-Security-Policy;
    }
    
    # Index page proxy  
    location = /index {
        proxy_pass http://127.0.0.1:3000/index.html;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Content-Security-Policy;
    }
    
    # WebSocket endpoint for SSH connections
    location /ssh {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Content-Security-Policy;
        proxy_buffering off;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    # All other requests to Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Content-Security-Policy;
    }
}
```

### Environment Considerations
- **Node.js Version:** Use Node.js v16 or newer for optimal performance and security
- **Process Manager:** Use PM2 or similar process manager for production deployments
- **Logging:** Configure proper logging and monitoring for production environments
- **Backup:** Regular backups of configuration and any persistent data
- **Updates:** Keep dependencies updated for security patches

### Performance Optimization
- **WebSocket Compression:** Enable compression for better performance on slower connections
- **Static Asset Caching:** Configure proper caching headers for static assets
- **Connection Limits:** Adjust concurrent connection limits based on server capacity
- **Memory Usage:** Monitor memory usage, especially with multiple concurrent SSH sessions

## Contributions

This is a community-driven project. Contributions, bug reports, and feature requests are welcome. Please feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/HereLiesHugo/KeySocket-v2).

# KeySocket: A Secure Web SSH Gateway

## Website:
### https://keysocket.eu

I thought there weren't enough free web ssh clients.
So here, a free web ssh client with modern styling.

Here's the boring version:

KeySocket is a self-hosted, web-based SSH client designed for secure and convenient access to remote terminals from any modern browser. It provides a clean, responsive interface powered by xterm.js and a robust Node.js backend.

The primary goal of this project is to offer a secure alternative to traditional desktop SSH clients, with a focus on usability for both desktop and mobile devices.

## Core Features

- **Web-Based Terminal:** A full-featured terminal emulator in the browser, powered by xterm.js with WebGL rendering for high performance.
- **Secure Authentication:** All sessions are protected by mandatory Google OAuth 2.0, ensuring that only authenticated users can access the gateway.
- **Flexible SSH Authentication:** Supports both password and private key-based authentication for connecting to remote hosts.
- **Client-Side Key Handling:** Private keys are handled exclusively in the browser's memory and are never stored on the server, providing a clear security boundary.
- **Mobile-First Design:** Includes a responsive on-screen keyboard with QWERTY, AZERTY, and symbol layouts, making it fully usable on tablets and phones.
- **Customizable Terminal:** The terminal window is fully resizable and includes a fullscreen mode for an immersive experience.
- **Connection Management:** Users can save frequently used connection details (host, port, user) to their browser's local storage for quick access.
- **Built-in Security:** The application is hardened with rate-limiting, a strict Content Security Policy (CSP), and secure WebSocket session handling.

## Security Model

Security is a primary consideration in KeySocket's design.

- **User Authentication:** Access to the gateway is restricted to users who have authenticated via Google OAuth. Anonymous connection attempts are not possible.
- **WebSocket Security:** WebSocket connections are tightly integrated with the Express.js session middleware. Only authenticated users with a valid session can establish a WebSocket connection.
- **Rate Limiting:** The server implements strict rate-limiting on all HTTP requests to prevent brute-force attacks and other abuse.
- **Client-Side Private Keys:** To prevent the server from becoming a high-value target for key theft, private keys are never sent to or stored on the server. They are loaded into the browser's memory for the duration of the connection attempt only. Users are strongly encouraged to use passphrase-encrypted keys as a best practice.

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
      # Google OAuth Credentials
      GOOGLE_CLIENT_ID="YOUR_CLIENT_ID_HERE"
      GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"

      # Session Security
      SESSION_SECRET="a_long_random_string_for_securing_sessions"

      # Application URL (important for OAuth redirects)
      APP_BASE_URL="http://localhost:3000"
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

## Contributions

This is a community-driven project. Contributions, bug reports, and feature requests are welcome. Please feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/HereLiesHugo/KeySocket-v2).

## Support

If you find this project useful, please consider supporting its development:
- **Website:** [maturqu.com](https://maturqu.com)
- **Ko-fi:** [Support on Ko-fi](https://ko-fi.com/maturqu)

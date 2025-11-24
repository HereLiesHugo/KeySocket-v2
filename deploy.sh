#!/bin/bash

# KeySocket Deployment Script
# Install on Nginx server to run the application

set -e

echo "🚀 KeySocket Deployment Script"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Variables
APP_DIR="/var/www/keysocket"
APP_USER="www-data"
NODE_VERSION="18"

echo -e "${YELLOW}Step 1: Install system dependencies${NC}"
apt-get update
apt-get install -y curl gnupg2 lsb-release ubuntu-keyring

echo -e "${YELLOW}Step 2: Install Node.js${NC}"
curl -sL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

echo -e "${YELLOW}Step 3: Install PM2 globally${NC}"
npm install -g pm2

echo -e "${YELLOW}Step 4: Clone or setup application${NC}"
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    echo "Created $APP_DIR"
else
    echo "$APP_DIR already exists"
fi

echo -e "${YELLOW}Step 5: Install dependencies${NC}"
cd "$APP_DIR"
npm install

echo -e "${YELLOW}Step 6: Setup environment${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Created .env from .env.example - please edit it!"
fi

echo -e "${YELLOW}Step 7: Setup Nginx configuration${NC}"
if [ -f "nginx/keysocket.conf" ]; then
    cp nginx/keysocket.conf /etc/nginx/sites-available/keysocket
    ln -sf /etc/nginx/sites-available/keysocket /etc/nginx/sites-enabled/keysocket
    
    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx config
    nginx -t
    systemctl restart nginx
    echo -e "${GREEN}Nginx configured${NC}"
fi

echo -e "${YELLOW}Step 8: Setup PM2 startup${NC}"
cd "$APP_DIR"
pm2 start server.js --name "keysocket"
pm2 startup systemd -u $APP_USER --hp $APP_DIR
pm2 save

echo -e "${YELLOW}Step 9: Setup systemd service (alternative)${NC}"
cat > /etc/systemd/system/keysocket.service << EOF
[Unit]
Description=KeySocket SSH Terminal
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo -e "${YELLOW}Step 10: Set permissions${NC}"
chown -R $APP_USER:$APP_USER "$APP_DIR"
chmod -R 755 "$APP_DIR"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano $APP_DIR/.env"
echo "2. Update Nginx config with your domain: nano /etc/nginx/sites-available/keysocket"
echo "3. Restart services:"
echo "   sudo systemctl restart nginx"
echo "   sudo systemctl restart keysocket (if using systemd)"
echo "   OR"
echo "   pm2 restart keysocket"
echo ""
echo "View logs:"
echo "  PM2: pm2 logs keysocket"
echo "  Nginx: sudo tail -f /var/log/nginx/keysocket-error.log"
echo ""
echo -e "${YELLOW}Don't forget to configure SSL certificates!${NC}"
echo "  Use Let's Encrypt: sudo certbot --nginx -d yourdomain.com"
echo ""

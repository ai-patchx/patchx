#!/bin/bash

# Deployment script for SSH Service API
# Usage: ./deploy.sh [systemd|pm2|docker]

set -e

DEPLOY_METHOD=${1:-systemd}
APP_DIR="/opt/ssh-service-api"
SERVICE_USER="www-data"

echo "🚀 Deploying SSH Service API using: $DEPLOY_METHOD"

# Check if running as root for systemd deployment
if [ "$DEPLOY_METHOD" = "systemd" ] && [ "$EUID" -ne 0 ]; then
    echo "❌ Error: systemd deployment requires root privileges"
    echo "Please run: sudo ./deploy.sh systemd"
    exit 1
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Create app directory
if [ ! -d "$APP_DIR" ]; then
    echo "📁 Creating app directory: $APP_DIR"
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$SERVICE_USER "$APP_DIR"
fi

# Copy files
echo "📋 Copying files..."
cp -r server.js package.json package-lock.json "$APP_DIR/"
if [ -f ".env" ]; then
    cp .env "$APP_DIR/"
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd "$APP_DIR"
npm install --production

# Set permissions
sudo chown -R $SERVICE_USER:$SERVICE_USER "$APP_DIR"

# Deploy based on method
case $DEPLOY_METHOD in
    systemd)
        echo "🔧 Setting up systemd service..."
        sudo tee /etc/systemd/system/ssh-service-api.service > /dev/null <<EOF
[Unit]
Description=SSH Service API
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment="NODE_ENV=production"
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ssh-service-api

[Install]
WantedBy=multi-user.target
EOF
        sudo systemctl daemon-reload
        sudo systemctl enable ssh-service-api
        sudo systemctl restart ssh-service-api
        echo "✅ Systemd service installed and started"
        echo "📊 Check status: sudo systemctl status ssh-service-api"
        ;;

    pm2)
        echo "🔧 Setting up PM2..."
        if ! command -v pm2 &> /dev/null; then
            sudo npm install -g pm2
        fi
        pm2 delete ssh-service-api 2>/dev/null || true
        cd "$APP_DIR"
        pm2 start server.js --name ssh-service-api
        pm2 save
        echo "✅ PM2 service installed and started"
        echo "📊 Check status: pm2 status"
        ;;

    docker)
        echo "🔧 Building and starting Docker container..."
        if ! command -v docker &> /dev/null; then
            echo "❌ Error: Docker is not installed"
            exit 1
        fi
        cd "$(dirname "$0")"
        docker-compose down 2>/dev/null || true
        docker-compose up -d --build
        echo "✅ Docker container built and started"
        echo "📊 Check status: docker-compose ps"
        ;;

    *)
        echo "❌ Error: Unknown deployment method: $DEPLOY_METHOD"
        echo "Usage: ./deploy.sh [systemd|pm2|docker]"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Configure .env file with API_KEY and other settings"
echo "2. Set up reverse proxy (nginx) with SSL if needed"
echo "3. Configure firewall to allow connections"
echo "4. Update SSH_SERVICE_API_URL in your Cloudflare Workers configuration"
echo ""
echo "🔍 Test the service:"
echo "   curl http://localhost:3000/health"

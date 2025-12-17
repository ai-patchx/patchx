# SSH Service API

**English** | [中文](README_cn.md)

A simple HTTP API service that executes SSH commands on remote servers. This service is designed to be deployed on your Ubuntu node and used by Cloudflare Workers via `SSH_SERVICE_API_URL`.

## Features

- Execute SSH commands via HTTP API
- Support for both SSH key and password authentication
- Secure temporary key file handling
- CORS support
- Optional API key authentication
- Health check endpoint

## Installation

### 1. Install Node.js (if not already installed)

```bash
# Using NodeSource repository (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Clone or Copy Files

Copy the `ssh-service-api` directory to your Ubuntu node:

```bash
# On your local machine
scp -r ssh-service-api/ user@your-ubuntu-node:/opt/ssh-service-api

# Or clone from your repository
git clone <your-repo-url> /opt/ssh-service-api
```

### 3. Install Dependencies

```bash
cd /opt/ssh-service-api
npm install
```

## Configuration

Create a `.env` file (optional):

```bash
# Port to listen on (default: 3000)
PORT=3000

# API key for authentication (optional but recommended)
API_KEY=your-secure-api-key-here

# Allowed CORS origins (comma-separated, or * for all)
ALLOWED_ORIGINS=https://patchx.pages.dev,https://your-worker.workers.dev
```

## Deployment Options

### Option 1: Systemd Service (Recommended)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/ssh-service-api.service
```

Add the following content:

```ini
[Unit]
Description=SSH Service API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ssh-service-api
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="API_KEY=your-secure-api-key-here"
Environment="ALLOWED_ORIGINS=https://patchx.pages.dev"
ExecStart=/usr/bin/node /opt/ssh-service-api/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ssh-service-api

[Install]
WantedBy=multi-user.target
```

Start and enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ssh-service-api
sudo systemctl start ssh-service-api
sudo systemctl status ssh-service-api
```

View logs:

```bash
sudo journalctl -u ssh-service-api -f
```

### Option 2: PM2 (Process Manager)

Install PM2:

```bash
sudo npm install -g pm2
```

Start the service:

```bash
cd /opt/ssh-service-api
pm2 start server.js --name ssh-service-api
pm2 save
pm2 startup  # Follow instructions to enable startup on boot
```

### Option 3: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t ssh-service-api .
docker run -d \
  --name ssh-service-api \
  -p 3000:3000 \
  -e PORT=3000 \
  -e API_KEY=your-secure-api-key-here \
  --restart unless-stopped \
  ssh-service-api
```

## Security Considerations

1. **Use HTTPS**: Deploy behind a reverse proxy (nginx/Apache) with SSL/TLS
2. **API Key Authentication**: Always set `API_KEY` environment variable
3. **Firewall**: Only allow connections from your Cloudflare Workers IPs
4. **Network Security**: Consider using a VPN or private network
5. **Rate Limiting**: Add rate limiting middleware if needed

## Nginx Reverse Proxy Setup

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/ssh-service-api
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/ssh-service-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL/TLS with Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Testing

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Test SSH command execution:

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "host": "localhost",
    "port": 22,
    "username": "testuser",
    "authType": "password",
    "password": "testpass",
    "command": "echo hello"
  }'
```

## API Usage

### Endpoint: `POST /execute`

**Request:**
```json
{
  "host": "string",
  "port": number,
  "username": "string",
  "authType": "key" | "password",
  "sshKey": "string (if authType is 'key')",
  "password": "string (if authType is 'password')",
  "command": "string"
}
```

**Response:**
```json
{
  "success": boolean,
  "output": "string",
  "error": "string (if success is false)"
}
```

## Configuration in Cloudflare Workers

To allow your Cloudflare Worker (PatchX backend) to call this SSH Service API and authenticate with the API key:

1. **Set environment variables in `.env.local`** (used by `scripts/sync-env-to-wrangler.js`):

   ```bash
   SSH_SERVICE_API_URL=https://your-domain.com
   SSH_SERVICE_API_KEY=your-secure-api-key-here
   ```

2. **Or configure directly in `wrangler.toml`**:

   ```toml
   SSH_SERVICE_API_URL = "https://your-domain.com"
   SSH_SERVICE_API_KEY = "your-secure-api-key-here"
   ```

The Worker will:

- Read `SSH_SERVICE_API_URL` and `SSH_SERVICE_API_KEY` from the environment
- Call `${SSH_SERVICE_API_URL}/execute`
- Send the header `Authorization: Bearer SSH_SERVICE_API_KEY` when testing connections and verifying the working home directory on the **Add Remote Node** page.

## Troubleshooting

1. **Connection refused**: Check firewall and ensure port is open
2. **SSH authentication fails**: Verify credentials and key format
3. **Permission denied**: Check file permissions on server.js
4. **Service won't start**: Check logs with `journalctl -u ssh-service-api`

## Monitoring

Monitor the service:

```bash
# Check service status
sudo systemctl status ssh-service-api

# View logs
sudo journalctl -u ssh-service-api -n 50

# Check if port is listening
sudo netstat -tlnp | grep 3000
```

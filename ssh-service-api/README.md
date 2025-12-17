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
# Port to listen on (default: 7000)
PORT=7000

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
Environment="PORT=7000"
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

EXPOSE 7000

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t ssh-service-api .
docker run -d \
  --name ssh-service-api \
  -p 7000:7000 \
  -e PORT=7000 \
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
        proxy_pass http://localhost:7000;
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
curl http://localhost:7000/health
```

Test SSH command execution:

```bash
curl -X POST http://localhost:7000/execute \
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

## Configuration in PatchX

SSH Service API configuration is now stored per-node in Supabase, allowing each remote node to have its own SSH service API endpoint and authentication key.

### Setting Up SSH Service API for a Remote Node

1. **Navigate to Settings Page**: Go to the Settings page (admin only) in PatchX
2. **Add or Edit Remote Node**: Click "Add Remote Node" or edit an existing node
3. **Configure SSH Service API**:
   - **SSH Service API URL**: Enter the URL of your SSH service API (e.g., `https://your-domain.com`)
   - **SSH Service API Key**: Enter the API key for authenticating with the SSH service API (optional, but recommended if your SSH service requires authentication)

4. **Test Connection**: Click "Test Connection" to verify:
   - SSH connectivity (host, port, banner, latency)
   - Working home directory verification (if SSH Service API URL is configured)

### How It Works

The Worker will:

- Read `SSH Service API URL` and `SSH Service API Key` from the node configuration in Supabase
- Call `${SSH_SERVICE_API_URL}/execute` when executing SSH commands
- Automatically send the header `Authorization: Bearer ${SSH_SERVICE_API_KEY}` when the API key is configured
- Use the SSH service API for:
  - Testing connections on the **Add Remote Node** page
  - Verifying working home directories
  - Executing git operations on remote nodes

### Benefits of Per-Node Configuration

- **Flexibility**: Each node can use a different SSH service endpoint
- **Organization**: SSH service settings are stored with node data
- **Security**: API keys are stored securely in Supabase per node
- **Scalability**: Easy to manage multiple nodes with different SSH service configurations

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
sudo netstat -tlnp | grep 7000
```

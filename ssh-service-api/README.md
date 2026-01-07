# SSH Service API

**English** | [中文](README_cn.md)

A simple HTTP API service that executes SSH commands on remote servers. This service is designed to be deployed on your Ubuntu node and used by Cloudflare Workers via `SSH_SERVICE_API_URL`.

## Features

- Execute SSH commands via HTTP API
- Dedicated git clone endpoint with template script support
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

#### Option 3a: Docker Compose (Recommended for Docker)

Using the provided `docker-compose.yml`:

```bash
# Set environment variables
export API_KEY=your-secure-api-key-here
export ALLOWED_ORIGINS=https://patchx.pages.dev,https://your-worker.workers.dev

# IMPORTANT: Set GIT_WORK_DIR to match the "Working Home" path configured in Remote Node settings
# This ensures git operations use the same directory on the host
export GIT_WORK_DIR=/home/your-user/git-work  # Replace with your actual Working Home path

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

Or create a `.env` file:

```bash
# .env file
API_KEY=your-secure-api-key-here
ALLOWED_ORIGINS=https://patchx.pages.dev,https://your-worker.workers.dev
GIT_WORK_DIR=/home/your-user/git-work  # Must match "Working Home" in Remote Node settings
```

Then run:

```bash
docker-compose up -d
```

#### Option 3b: Docker (Manual)

The `Dockerfile` is already provided in the repository:

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install OpenSSH client and git (needed for SSH operations and git clone)
RUN apt-get update && apt-get install -y openssh-client git && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 7000

USER node

CMD ["node", "server.js"]
```

**Note:** The Dockerfile includes `git` package installation which is required for the `/git-clone` endpoint to work properly.

Build and run:

```bash
docker build -t ssh-service-api .
docker run -d \
  --name ssh-service-api \
  -p 7000:7000 \
  -e PORT=7000 \
  -e API_KEY=your-secure-api-key-here \
  -e ALLOWED_ORIGINS=https://patchx.pages.dev \
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
    listen 8080;
    server_name your-domain.com;

    return 301 https://$host$request_uri;
}

server {
    listen 8443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/certs/public.crt;
    ssl_certificate_key /etc/nginx/certs/private.key;

    # To allow special characters in headers
    ignore_invalid_headers off;
    # Allow any size file to be uploaded
    client_max_body_size 0;
    # To disable buffering
    proxy_buffering off;
    proxy_request_buffering off;

    location /api/ssh/ {
        proxy_pass http://localhost:7000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location = /api/ssh {
        return 301 /api/ssh/;
    }
}
```

**Note for Docker deployments:** If using Docker Compose, replace `localhost` with the service name in `proxy_pass`:
```nginx
location /api/ssh/ {
    proxy_pass http://ssh-service-api:7000/;
    # ... rest of configuration
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

### Test Scripts

**Quick Start:**
```bash
# Make scripts executable
chmod +x test-*.sh

# Test all endpoints and connectivity (defaults to https://supagraph.ai:8443/api/ssh)
./test-connection.sh

# Test git clone endpoint (password will be prompted if not provided)
./test-git-clone.sh https://supagraph.ai:8443/api/ssh sk-1234 your-host your-user your-password

# Test execute endpoint
./test-execute.sh https://supagraph.ai:8443/api/ssh sk-1234 your-host your-user your-password "echo test"

# Test patch merge workflow
./test-patch-merge.sh https://supagraph.ai:8443/api/ssh sk-1234 your-host your-user your-password ~/git-work/repo ../examples/platform-build-soong.patch

# Test full workflow (clone + patch + status)
./test-full-workflow.sh https://supagraph.ai:8443/api/ssh sk-1234 your-host your-user your-password platform/build/soong master https://android-review.googlesource.com ../examples/platform-build-soong.patch
```

### Health Check

Test the health endpoint:

```bash
curl http://localhost:7000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-18T04:50:20.426Z",
  "uptime": 70070.345201324
}
```

### SSH Command Execution

Test SSH command execution with password authentication:

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

Test SSH command execution with key authentication:

```bash
curl -X POST http://localhost:7000/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "host": "your-server-ip",
    "port": 22,
    "username": "your-username",
    "authType": "key",
    "sshKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
    "command": "echo hello"
  }'
```

**Important Notes for SSH Key Authentication:**
- The SSH private key must be in OpenSSH format
- The corresponding public key must be added to `~/.ssh/authorized_keys` on the target server
- To extract the public key from a private key: `ssh-keygen -y -f /path/to/private_key`
- Ensure proper permissions: `chmod 600 ~/.ssh/authorized_keys` on the server

**Testing through Nginx Reverse Proxy:**
If you've configured nginx with the `/api/ssh/` location, test using:
```bash
curl -X POST https://your-domain.com/api/ssh/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "host": "your-server-ip",
    "port": 22,
    "username": "your-username",
    "authType": "key",
    "sshKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
    "command": "echo hello"
  }'
```

## API Usage

### Endpoint: `POST /git-clone`

**Description:** Dedicated endpoint for cloning git repositories on remote nodes. Uses the git-clone-template.sh script logic.

**Request:**
```json
{
  "host": "string",
  "port": number,
  "username": "string",
  "authType": "key" | "password",
  "sshKey": "string (if authType is 'key')",
  "password": "string (if authType is 'password')",
  "repositoryUrl": "string (required) - Git repository URL",
  "branch": "string (required) - Target branch to clone",
  "workingHome": "string (optional) - Working directory path, defaults to ~/git-work",
  "targetDir": "string (optional) - Target directory name, auto-generated if not provided"
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

**Example:**
```bash
curl -X POST http://localhost:7000/git-clone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "host": "remote-server.example.com",
    "port": 22,
    "username": "gituser",
    "authType": "key",
    "sshKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
    "repositoryUrl": "https://github.com/user/repo.git",
    "branch": "main",
    "workingHome": "/home/gituser/git-work"
  }'
```

**Note:** This endpoint is automatically used by the GitService when SSH Service API is configured. The git-clone-template.sh script logic is embedded in the service and executed on the remote node.

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
   - **SSH Service API URL**: Enter the URL of your SSH service API (e.g., `https://your-domain.com/api/ssh`)
   - **SSH Service API Key**: Enter the API key for authenticating with the SSH service API (optional, but recommended if your SSH service requires authentication)

4. **Test Connection**: Click "Test Connection" to verify:
   - SSH connectivity (host, port, banner, latency)
   - Working home directory verification (if SSH Service API URL is configured)

### How It Works

The Worker will:

- Read `SSH Service API URL` and `SSH Service API Key` from the node configuration in Supabase
- Call `${SSH_SERVICE_API_URL}/execute` when executing SSH commands
- Call `${SSH_SERVICE_API_URL}/git-clone` when cloning git repositories (if endpoint is available)
- Automatically send the header `Authorization: Bearer ${SSH_SERVICE_API_KEY}` when the API key is configured
- Use the SSH service API for:
  - Testing connections on the **Add Remote Node** page
  - Verifying working home directories
  - Executing git operations on remote nodes (clone, checkout, apply patch, etc.)

### Benefits of Per-Node Configuration

- **Flexibility**: Each node can use a different SSH service endpoint
- **Organization**: SSH service settings are stored with node data
- **Security**: API keys are stored securely in Supabase per node
- **Scalability**: Easy to manage multiple nodes with different SSH service configurations

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

## Troubleshooting

### API Issues

1. **Connection refused**:
   - Check firewall and ensure port 7000 is open
   - Verify the service is running: `docker ps` or `systemctl status ssh-service-api`
   - Check if port is listening: `netstat -tlnp | grep 7000`

2. **401 Unauthorized**:
   - Verify the API key matches the `API_KEY` environment variable
   - Check that the `Authorization: Bearer <api-key>` header is being sent correctly

3. **403 Forbidden**:
   - Check if API key is correct
   - Verify reverse proxy or firewall configuration
   - Ensure the SSH Service API URL is correct

### SSH Connection Issues

1. **SSH authentication fails - "All configured authentication methods failed"**:
   - For key authentication: Ensure the public key is in `~/.ssh/authorized_keys` on the target server
   - Extract public key: `ssh-keygen -y -f /path/to/private_key`
   - Verify key format: Private key must be in OpenSSH format
   - Check permissions: `chmod 600 ~/.ssh/authorized_keys` and `chmod 700 ~/.ssh` on the server
   - Test SSH connection directly: `ssh -i /path/to/private_key username@host`

2. **SSH connection timeout**:
   - Verify the host and port are correct
   - Check network connectivity from the SSH service API container/host
   - Ensure SSH service is running on the target server

3. **Permission denied**:
   - Check file permissions on server.js (if running directly)
   - Verify Docker container has proper permissions (if using Docker)
   - Check systemd service user permissions (if using systemd)

4. **Service won't start**:
   - Check logs: `journalctl -u ssh-service-api -f` (systemd)
   - Check logs: `docker-compose logs -f` (Docker Compose)
   - Check logs: `docker logs ssh-service-api` (Docker)
   - Verify Node.js is installed: `node --version`
   - Check dependencies: `npm install` in the service directory

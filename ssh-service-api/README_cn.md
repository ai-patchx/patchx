# SSH 服务 API

**[English](README.md)** | 中文

一个简单的 HTTP API 服务，用于在远程服务器上执行 SSH 命令。此服务设计用于部署在您的 Ubuntu 节点上，并通过 `SSH_SERVICE_API_URL` 供 Cloudflare Workers 使用。

## 功能特性

- 通过 HTTP API 执行 SSH 命令
- 支持 SSH 密钥和密码两种认证方式
- 安全的临时密钥文件处理
- CORS 支持
- 可选的 API 密钥认证
- 健康检查端点

## 安装

### 1. 安装 Node.js（如果尚未安装）

```bash
# 使用 NodeSource 仓库（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 克隆或复制文件

将 `ssh-service-api` 目录复制到您的 Ubuntu 节点：

```bash
# 在本地机器上
scp -r ssh-service-api/ user@your-ubuntu-node:/opt/ssh-service-api

# 或从仓库克隆
git clone <your-repo-url> /opt/ssh-service-api
```

### 3. 安装依赖

```bash
cd /opt/ssh-service-api
npm install
```

## 配置

创建 `.env` 文件（可选）：

```bash
# 监听端口（默认：7000）
PORT=7000

# API 密钥用于认证（可选但推荐）
API_KEY=your-secure-api-key-here

# 允许的 CORS 来源（逗号分隔，或 * 表示全部）
ALLOWED_ORIGINS=https://patchx.pages.dev,https://your-worker.workers.dev
```

## 部署选项

### 选项 1：Systemd 服务（推荐）

创建 systemd 服务文件：

```bash
sudo nano /etc/systemd/system/ssh-service-api.service
```

添加以下内容：

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

启动并启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable ssh-service-api
sudo systemctl start ssh-service-api
sudo systemctl status ssh-service-api
```

查看日志：

```bash
sudo journalctl -u ssh-service-api -f
```

### 选项 2：PM2（进程管理器）

安装 PM2：

```bash
sudo npm install -g pm2
```

启动服务：

```bash
cd /opt/ssh-service-api
pm2 start server.js --name ssh-service-api
pm2 save
pm2 startup  # 按照说明启用开机自启
```

### 选项 3：Docker

创建 `Dockerfile`：

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 7000

CMD ["node", "server.js"]
```

构建并运行：

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

## 安全注意事项

1. **使用 HTTPS**：在反向代理（nginx/Apache）后部署，并配置 SSL/TLS
2. **API 密钥认证**：始终设置 `API_KEY` 环境变量
3. **防火墙**：仅允许来自 Cloudflare Workers IP 的连接
4. **网络安全**：考虑使用 VPN 或私有网络
5. **速率限制**：如需要，添加速率限制中间件

## Nginx 反向代理设置

创建 nginx 配置：

```bash
sudo nano /etc/nginx/sites-available/ssh-service-api
```

添加：

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

启用并重启：

```bash
sudo ln -s /etc/nginx/sites-available/ssh-service-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 使用 Let's Encrypt 配置 SSL/TLS

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 测试

测试健康检查端点：

```bash
curl http://localhost:7000/health
```

测试 SSH 命令执行：

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

## API 使用

### 端点：`POST /execute`

**请求：**
```json
{
  "host": "string",
  "port": number,
  "username": "string",
  "authType": "key" | "password",
  "sshKey": "string (如果 authType 是 'key')",
  "password": "string (如果 authType 是 'password')",
  "command": "string"
}
```

**响应：**
```json
{
  "success": boolean,
  "output": "string",
  "error": "string (如果 success 为 false)"
}
```

## 在 PatchX 中配置

SSH 服务 API 配置现在存储在 Supabase 中，每个远程节点可以有自己的 SSH 服务 API 端点和认证密钥。

### 为远程节点设置 SSH 服务 API

1. **访问设置页面**：在 PatchX 中进入设置页面（仅管理员）
2. **添加或编辑远程节点**：点击"添加远程节点"或编辑现有节点
3. **配置 SSH 服务 API**：
   - **SSH Service API URL**：输入您的 SSH 服务 API 的 URL（例如：`https://your-domain.com`）
   - **SSH Service API Key**：输入用于 SSH 服务 API 认证的 API 密钥（可选，但如果您的 SSH 服务需要认证，则推荐配置）

4. **测试连接**：点击"测试连接"以验证：
   - SSH 连接性（主机、端口、横幅、延迟）
   - 工作主目录验证（如果配置了 SSH Service API URL）

### 工作原理

Worker 将会：

- 从 Supabase 中的节点配置读取 `SSH Service API URL` 和 `SSH Service API Key`
- 在执行 SSH 命令时调用 `${SSH_SERVICE_API_URL}/execute`
- 当配置了 API 密钥时，自动发送请求头 `Authorization: Bearer ${SSH_SERVICE_API_KEY}`
- 使用 SSH 服务 API 进行：
  - 在 **"添加远程节点"** 页面上测试连接
  - 验证工作主目录
  - 在远程节点上执行 git 操作

### 每节点配置的优势

- **灵活性**：每个节点可以使用不同的 SSH 服务端点
- **组织性**：SSH 服务设置与节点数据一起存储
- **安全性**：API 密钥安全地存储在 Supabase 中，每个节点独立
- **可扩展性**：易于管理具有不同 SSH 服务配置的多个节点

## 故障排除

1. **连接被拒绝**：检查防火墙并确保端口已开放
2. **SSH 认证失败**：验证凭据和密钥格式
3. **权限被拒绝**：检查 server.js 的文件权限
4. **服务无法启动**：使用 `journalctl -u ssh-service-api` 查看日志

## 监控

监控服务：

```bash
# 检查服务状态
sudo systemctl status ssh-service-api

# 查看日志
sudo journalctl -u ssh-service-api -n 50

# 检查端口是否在监听
sudo netstat -tlnp | grep 7000
```

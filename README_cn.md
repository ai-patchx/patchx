# PatchX

**[English](README.md)** | 中文

一个用于简化 Android 开源项目（AOSP）代码贡献流程的 Web 服务，支持 AI 驱动的 patch 冲突解决。

## 🚀 功能特性

- 📤 **文件上传**: 支持拖拽上传 Git patch 文件
- ✅ **格式验证**: 自动验证 patch 文件格式
- 🤖 **AI冲突解决**: 智能分析和解决代码冲突
- 🔄 **自动提交**: 自动提交到 Google AOSP Gerrit
- 📊 **状态跟踪**: 实时显示提交进度和结果
- 📱 **响应式设计**: 支持桌面和移动设备
- 🔐 **用户登录与令牌鉴权**
- 🧑‍💻 **用户注册**：仅支持邮箱注册（基于 Supabase）

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **后端**: Cloudflare Workers + TypeScript
- **AI集成**: 支持 OpenAI、Anthropic 等第三方大模型
- **存储**: Cloudflare KV
- **部署**: Cloudflare Workers + Pages

## 🤖 AI 冲突解决特性

### 支持的 AI 提供商
- **OpenAI**: GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3 Sonnet, Claude 3 Haiku
- **自定义**: 支持 OpenAI API 兼容的任何提供商

### AI 功能
- **智能冲突检测**: 自动识别 patch 中的代码冲突
- **多提供商对比**: 同时使用多个 AI 提供商，选择最佳解决方案
- **置信度评估**: AI 解决方案的可信度评分
- **人工审查建议**: 标记需要人工确认的复杂冲突

## 📦 安装和运行

### 本地开发

本项目采用前后端分离架构，需要同时运行两个开发服务器：

#### 终端 1: 前端开发服务器（Vite）
```bash
# 安装依赖
npm install

# 格式化
npm run lint -- --fix

# 启动前端开发服务器
npm run dev
# 访问: http://localhost:5173
```

在 Cloudflare Workers 上为测试账号密码设置变量：

```bash
wrangler secret put TEST_USER_PASSWORD
```

### 鉴权与注册（本地开发）

- 首页提供登录/注册弹窗
- 仅支持邮箱注册（基于 Supabase）
- 在 `.env.local` 配置以下变量：
```bash
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

在 Supabase 中启用 GitHub OAuth：
- 在 Auth 设置中开启 GitHub 提供商
- 设置重定向地址：`http://localhost:5173/auth/callback`

遗留的测试账号（仅用于 Worker API 测试）：
- 默认测试账号：`用户名=patchx`，`密码=patchx`
- 可通过 `TEST_USER_PASSWORD` 覆盖测试密码
示例：
- PowerShell（Windows）：
```powershell
$env:TEST_USER_PASSWORD="your_password"; npm run dev
```
- Vite 助手脚本：
```bash
npm run dev:env  # 使用 TEST_USER_PASSWORD=test123 启动开发服务器
```

#### 终端 2: 后端 API 服务器（Wrangler）
```bash
# 构建 Cloudflare Worker（API）
npm run build:worker

# 启动后端 API 开发服务器
wrangler dev
# API 端点: http://127.0.0.1:8787
```

**注意**: 两个服务器必须同时运行才能完整使用所有功能。前端通过 API 调用与后端通信。

### 代码检查
```bash
# 运行 ESLint 检查
npm run lint

# 运行 TypeScript 类型检查
npm run check
```

### 构建和部署

```bash
# 构建项目
npm run build

# 构建 Cloudflare Worker（API）
npm run build:worker
```

### Cloudflare Workers 开发

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 本地开发（API Worker）
npm run build:worker
wrangler dev

# 部署到生产环境（API Worker）
npm run build:worker
wrangler deploy
```

## 🔄 开发服务器说明

### 服务器区别

| 服务器 | 端口 | 用途 | 访问地址 |
|--------|------|------|----------|
| **Vite Dev Server** | 5173 | 前端 React 应用 | http://localhost:5173 |
| **Wrangler Dev Server** | 8787 | 后端 API Worker | http://127.0.0.1:8787 |

### 常见问题

**Q: 为什么访问 `http://127.0.0.1:8787` 显示 404？**
A: Wrangler 服务器只提供 API 端点，没有根路径路由。请访问具体的 API 端点，如：
- `http://127.0.0.1:8787/api/ai/providers`
- `http://127.0.0.1:8787/api/upload`

**Q: 如何测试 API 是否正常工作？**
A: 可以使用以下命令测试 API：
```bash
# 测试 AI 提供商列表
Invoke-WebRequest -Uri http://127.0.0.1:8787/api/ai/providers -Method GET

# 或者使用 curl（如果已安装）
curl http://127.0.0.1:8787/api/ai/providers
```

## 🔧 AI 配置

### 环境变量配置

在 Cloudflare Workers 中设置以下 AI 相关的环境变量：

```bash
# OpenAI 配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.1

# Anthropic 配置
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=2000
ANTHROPIC_TEMPERATURE=0.1

# 自定义 AI 提供商（兼容OpenAI API）
CUSTOM_AI_BASE_URL=https://your-custom-ai-provider.com/v1
CUSTOM_AI_API_KEY=your-custom-api-key
CUSTOM_AI_MODEL=gpt-3.5-turbo
CUSTOM_AI_MAX_TOKENS=2000
CUSTOM_AI_TEMPERATURE=0.1

# 鉴权相关
TEST_USER_PASSWORD=your-secure-password

# Supabase（前端）
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 前端环境变量（Vite）

为避免端点硬编码并按环境区分配置，请设置前端用于访问后端 Worker 的基地址：

```bash
VITE_WORKER_BASE_URL=https://patchx-service.angersax.workers.dev
```

登录页面将调用 `${VITE_WORKER_BASE_URL}/api/auth/login`，可在不同环境设置不同值（如 staging/production）。

#### Cloudflare Pages：Supabase 环境变量配置

在 Cloudflare Pages 项目中为前端构建配置 Supabase 环境变量：

1. 进入 Cloudflare Pages → 选择项目 → Settings → Environment variables
2. 在 "Production" 与 "Preview"（按需）添加以下变量：
   - `VITE_SUPABASE_URL` → `https://<your-project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → `<your_anon_key>`
3. 重新部署 Pages 项目使新的环境变量生效。

说明：
- Vite 仅会将以 `VITE_` 开头的变量暴露到前端代码；Supabase 的 anon key 设计为公开可在前端使用。请勿在前端使用 service role key。

#### Cloudflare Workers：通过 `wrangler.toml` 配置 Supabase

也可以在 Workers 端配置 Supabase，并由前端在运行时拉取：

1. 在 `wrangler.toml` 增加变量：
```toml
[env.production.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"

[env.staging.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"
```
2. Worker 提供公共配置端点 `/api/config/public`，返回 `{ supabaseUrl, supabaseAnonKey }`。
3. 前端采用惰性初始化 Supabase，当未设置 `VITE_SUPABASE_*` 时将回退到该端点。

### Gerrit 配置

在 Cloudflare Workers 中配置与 AOSP Gerrit 交互所需的环境变量与密钥：

```bash
# Gerrit 基本配置（wrangler.toml 中 vars）
GERRIT_BASE_URL=https://android-review.googlesource.com
MAX_FILE_SIZE=10485760           # 10MB
RATE_LIMIT_WINDOW=900000         # 15分钟（毫秒）
RATE_LIMIT_MAX=10                # 窗口内最大请求数

# Gerrit 凭据（使用 Wrangler Secrets 存储）
# 这些是敏感信息，务必使用 secrets 管理
wrangler secret put GERRIT_USERNAME
wrangler secret put GERRIT_PASSWORD

# AI 提供商密钥（同样使用 secrets 管理）
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put CUSTOM_AI_API_KEY
```

### KV 命名空间

确保在 `wrangler.toml` 中绑定 KV 命名空间：

```toml
[env.production]
kv_namespaces = [
  { binding = "AOSP_PATCH_KV", id = "<your_kv_id>" }
]
```

### AI 功能启用

AI 冲突解决功能会根据配置自动启用：

1. **自动检测**: 系统会自动检测可用的 AI 提供商
2. **多提供商模式**: 可以同时配置多个 AI 提供商进行对比
3. **智能选择**: 系统会选择置信度最高的 AI 解决方案

## 📋 API 文档

### 鉴权 API

#### 登录
```
POST /api/auth/login
```

Request:
```json
{
  "username": "patchx",
  "password": "<password>"
}
```

Response:
```json
{
  "user": { "id": "user-123", "username": "patchx" },
  "token": "<base64-token>",
  "message": "登录成功"
}
```

#### 当前用户（需要鉴权）
```
GET /api/auth/me
```

Headers:
```
Authorization: Bearer <token>
```

Response:
```json
{
  "user": { "id": "user-123", "username": "patchx" },
  "message": "获取用户信息成功"
}
```

说明：
- 受保护的接口需要携带 `Authorization: Bearer <token>` 请求头。
- 前端在登录后会自动添加该请求头。

### AI 冲突解决 API

#### 解决代码冲突
```
POST /api/ai/resolve-conflict
```

Request:
```json
{
  "originalCode": "原始代码内容",
  "incomingCode": "传入的 patch 代码",
  "currentCode": "当前代码内容",
  "filePath": "文件路径",
  "provider": "openai",
  "useMultipleProviders": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "resolvedCode": "解决后的代码",
    "explanation": "解决策略解释",
    "confidence": 0.85,
    "suggestions": ["建议1", "建议2"],
    "requiresManualReview": false
  }
}
```

### Patch 上传与提交 API

#### 上传 Patch 文件
```
POST /api/upload
```

Request（`multipart/form-data`）：
- `file`: Git patch 文件
- `project`: 目标项目（例如 `platform/frameworks/base`）

Response:
```json
{
  "success": true,
  "data": {
    "uploadId": "<id>",
    "status": "success",
    "message": "文件上传成功"
  }
}
```

#### 创建提交并异步推送到 Gerrit
```
POST /api/submit
```

Request（`application/json`）：
```json
{
  "uploadId": "<id>",
  "subject": "提交标题",
  "description": "提交描述",
  "branch": "refs/heads/master"
}
```

Response：
```json
{
  "success": true,
  "data": {
    "submissionId": "<id>",
    "status": "processing"
  }
}
```

#### 查询提交状态
```
GET /api/status/<submissionId>
```

Response：
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "changeId": "12345",
    "changeUrl": "https://android-review.googlesource.com/#/c/12345/",
    "createdAt": "2025-11-14T12:00:00Z",
    "error": null
  }
}
```

#### 获取 AI 提供商列表
```
GET /api/ai/providers
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "providers": ["openai", "anthropic", "custom"],
    "message": "AI 冲突解决已启用"
  }
}
```

#### 测试 AI 提供商
```
POST /api/ai/test-providers
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "provider": "openai",
      "success": true,
      "latency": 1200,
      "error": null
    },
    {
      "provider": "anthropic",
      "success": true,
      "latency": 800,
      "error": null
    }
  ]
}
```

## 🚀 部署步骤

### 1. 基础配置
- 创建 Cloudflare 账户
- 安装 Wrangler CLI
- 配置 KV 命名空间

### 2. AI 提供商配置
- 获取 OpenAI API 密钥
- 获取 Anthropic API 密钥（可选）
- 配置自定义 AI 提供商（可选）

### 3. 环境变量设置
在 Cloudflare Workers 设置页面添加所有必要的环境变量。

### 4. 后端部署（Cloudflare Workers）
```bash
# 构建 Worker
npm run build:worker

# 部署到 Cloudflare Workers
wrangler deploy
```

### 5. 前端部署（Cloudflare Pages）
```bash
# 构建前端
npm run build

# 部署到 Cloudflare Pages
wrangler pages deploy dist --project-name=patchx
```

### 部署后的服务地址
- **前端（Cloudflare Pages）**: `https://patchx.pages.dev`
- **后端 API（Cloudflare Workers）**: `https://patchx-service.angersax.workers.dev`

### 自动重定向配置
前端通过 `_redirects` 文件自动将 `/api/*` 请求转发到后端 Workers，无需修改前端代码。

## 💡 使用建议

### AI 冲突解决最佳实践

1. **多提供商对比**: 启用多个 AI 提供商以获得更好的解决方案
2. **置信度评估**: 关注 AI 解决方案的置信度评分
3. **人工审查**: 对于复杂冲突，始终进行人工审查
4. **测试验证**: 应用 AI 解决方案后，充分测试代码功能

### 性能优化

1. **缓存策略**: 对相似的冲突结果进行缓存
2. **超时设置**: 为 AI 调用设置合理的超时时间
3. **并发控制**: 限制同时进行的 AI 请求数量
4. **错误重试**: 实现智能的错误重试机制

## 🔒 安全考虑

- **API 密钥保护**: 所有 AI 提供商的 API 密钥都存储在环境变量中
- **请求限制**: 实现速率限制防止滥用
- **内容过滤**: 对输入和输出进行适当的内容检查
- **审计日志**: 记录所有 AI 冲突解决操作
- **生产环境日志**: 生产构建中自动禁用常规控制台输出（log/debug/info/warn），避免日志外泄

## 📄 许可证

Apache-2.0
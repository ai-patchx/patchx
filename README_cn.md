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
- 📋 **动态项目列表**: 自动从 Gerrit 获取所有项目
- 🌿 **动态分支列表**: 自动获取所选项目的所有分支
- 🔍 **可搜索下拉框**: 支持实时搜索和过滤项目和分支
- ⚡ **智能缓存**: 项目和分支数据本地缓存 10 分钟，提升性能并减少 API 调用
- 🖥️ **远程节点管理**: 配置和管理用于 git 操作的 SSH 远程节点
- 🔐 **SSH 认证**: 支持 SSH 密钥和密码两种认证方式
- 📁 **工作目录**: 为远程 git 操作指定工作主目录

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **后端**: Cloudflare Workers + TypeScript
- **AI集成**: 支持 OpenAI、Anthropic 等第三方大模型
- **存储**: Supabase（用于用户数据和远程节点），Cloudflare KV（用于缓存）
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
- 注册后，用户会收到一封包含 8 位数字验证码的邮件
- 在注册弹窗中输入验证码以完成账户设置

**重要提示：** 要使用验证码而非确认链接，您必须配置 Supabase 邮件模板：
1. 进入 Supabase 仪表板 → Authentication → Email Templates
2. 编辑 "Confirm Signup" 模板
3. 将 `{{ .ConfirmationURL }}` 替换为 `{{ .Token }}` 以显示验证码
4. 详细说明请参阅 `SUPABASE_EMAIL_TEMPLATE_SETUP.md`

复制 `.env.example` 为 `.env.local` 并配置以下变量：
```bash
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_SITE_URL=http://localhost:5173
LITELLM_BASE_URL=https://your-litellm-server.com
LITELLM_API_KEY=your-litellm-api-key
GERRIT_BASE_URL=https://android-review.googlesource.com
GERRIT_USERNAME=your-gerrit-username
GERRIT_PASSWORD=your-gerrit-password-or-token
CACHE_VERSION=v1
```

**注意：** SSH 服务 API 配置（SSH_SERVICE_API_URL 和 SSH_SERVICE_API_KEY）现在在设置页面中按节点配置，不再作为环境变量。请参阅下面的远程节点配置部分。
`VITE_PUBLIC_SITE_URL` 用于邮箱验证。本地开发可保持为 `http://localhost:5173`，线上部署时请设置为实际站点地址（如 `https://patchx.pages.dev`）。

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
```

**认证方式：**

对于 Ubuntu/WSL 用户，推荐使用 API Token 方式（无需浏览器交互）：

1. 获取 API Token：访问 https://dash.cloudflare.com/profile/api-tokens
2. 设置环境变量：
   ```bash
   export CLOUDFLARE_API_TOKEN='your-api-token-here'
   ```
3. 持久化配置（添加到 shell 配置文件）：
   ```bash
   # 对于 bash
   echo 'export CLOUDFLARE_API_TOKEN="your-api-token-here"' >> ~/.bashrc
   source ~/.bashrc

   # 对于 zsh
   echo 'export CLOUDFLARE_API_TOKEN="your-api-token-here"' >> ~/.zshrc
   source ~/.zshrc
   ```
4. 验证认证：
   ```bash
   npx wrangler whoami
   ```

**注意：** 设置 `CLOUDFLARE_API_TOKEN` 后，wrangler 会自动使用该 token 进行认证。使用 API Token 方式时无需运行 `wrangler login`。

```bash
# 本地开发（API Worker）
npm run build:worker
wrangler dev

# 部署到生产环境（API Worker）
npm run build:worker
wrangler deploy
# 或使用部署脚本：
npm run deploy
```

**注意：** `wrangler deploy` **不会**重置数据库。数据库重置功能可通过以下脚本单独使用。

### 数据库管理

#### 重置数据库

数据库重置功能作为可选脚本提供，在 `wrangler deploy` 过程中**永远不会**执行。

**使用 npm 脚本：**
```bash
# 使用 Supabase 进行身份验证
npx supabase login

# 带确认提示的重置数据库
npm run db:reset

# 无需确认的重置数据库（请谨慎使用）
npm run db:reset:confirm
```

**环境变量：**

根据 `.env.example` 创建/更新 `.env.local` 并配置：
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_SITE_URL=https://patchx.pages.dev
```

脚本会自动从 `SUPABASE_URL` 中提取项目引用，因此您无需单独设置 `SUPABASE_PROJECT_REF`。

**替代方案：直接数据库连接**

如果您不想进行身份验证，可以通过在 `.env.local` 中添加 `DATABASE_URL` 来使用直接数据库连接：

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

您可以在 Supabase 仪表板的 **设置** → **数据库** → **连接字符串** 中找到数据库密码。

**重要提示：**
- 数据库重置在 `wrangler deploy` 或 Cloudflare Pages 部署过程中**永远不会**执行
- 重置前请务必备份数据
- 除非使用 `--confirm`，否则重置脚本需要明确确认
- 对于远程项目，需要通过 `npx supabase login` 进行身份验证（除非使用 `DATABASE_URL`）

**故障排除：重新部署后无法登录？**

如果用户在重新部署到 Cloudflare 后无法登录，请检查：

1. **Cloudflare Pages 中的环境变量：**
   - 进入 Cloudflare Pages 仪表板 → 您的项目 → 设置 → 环境变量
   - 验证 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 是否已为生产环境设置
   - 确保它们指向用户注册的**同一个** Supabase 项目

2. **Supabase 项目：**
   - 检查 Supabase 项目是否在 Supabase 仪表板中被手动重置
   - 验证项目 URL 和密钥是否已更改
   - 确认用户账户存在于 Supabase Auth 用户表中

3. **环境变量不匹配：**
   - 本地开发使用 `.env.local` 文件
   - Cloudflare Pages 使用仪表板中设置的环境变量
   - 这些必须指向同一个 Supabase 项目

**注意：** 数据库重置脚本（`scripts/reset-db.sh`）在部署过程中**永远不会**自动调用。如果登录失败，几乎总是环境变量配置问题。

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
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# LiteLLM（用于补丁冲突解决中的模型选择）
LITELLM_BASE_URL=https://your-litellm-server.com
LITELLM_API_KEY=your-litellm-api-key
```

### 邮件通知配置

补丁提交流程通过 [Resend](https://resend.com/)（提供免费套餐）或 MailChannels API（备用方案）发送状态邮件。

#### 选项 1：Resend（推荐 - 提供免费套餐）

Resend 提供慷慨的免费套餐：
- **每月 3,000 封邮件**
- **每天 100 封邮件**

#### 获取 Resend API 密钥

1. **注册 Resend：**
   - 访问 [Resend](https://resend.com/) 并创建免费账户
   - 免费套餐无需信用卡

2. **获取您的 API 密钥：**
   - 登录您的 Resend 控制台
   - 导航到 API Keys（API 密钥）部分
   - 创建新的 API 密钥
   - 复制 API 密钥（以 `re_` 开头）

3. **验证您的域名（发送邮件必需）：**
   - 在 Resend 控制台中，转到 Domains（域名）
   - 添加并验证您的发送域名
   - 按照 DNS 验证说明操作
   - 确保您的 `RESEND_FROM_EMAIL` 使用已验证的域名

#### 选项 2：MailChannels API（备用方案）

**重要提示：** 自 2024 年 8 月起，MailChannels 已停止为 Cloudflare Workers 提供免费服务。您现在需要注册 MailChannels Email API 计划才能发送邮件。

#### 获取 MailChannels API 密钥

1. **注册 MailChannels Email API：**
   - 访问 [MailChannels Email API](https://mailchannels.com/email-api) 并注册一个计划
   - 选择适合您邮件发送量的计划

2. **获取您的 API 密钥：**
   - 登录您的 MailChannels 控制台
   - 导航到 API Keys（API 密钥）部分
   - 创建新的 API 密钥
   - 复制 API 密钥（之后将无法再次查看）

3. **验证您的域名（如需要）：**
   - 某些计划需要域名验证
   - 按照 MailChannels 的说明验证您的发送域名
   - 确保您的 `MAILCHANNELS_FROM_EMAIL` 使用已验证的域名

#### Resend 配置

请在 `wrangler.toml`（或 Cloudflare 后台）中为各环境设置以下变量：

```bash
RESEND_API_KEY=re_your-resend-api-key
RESEND_FROM_EMAIL=no-reply@your-domain.com
RESEND_FROM_NAME="PatchX"
RESEND_REPLY_TO_EMAIL=patchx@your-domain.com   # 可选
```

**安全提示：** 对于生产环境，建议使用 Cloudflare Workers 密钥而不是将 API 密钥存储在 `wrangler.toml` 中：

```bash
# 设置为密钥（不在 wrangler.toml 中）
wrangler secret put RESEND_API_KEY
```

然后通过 `env.RESEND_API_KEY` 在 worker 代码中访问它。

#### MailChannels 配置（备用方案）

如果未配置 Resend，系统将回退到 MailChannels API：

```bash
MAILCHANNELS_FROM_EMAIL=no-reply@your-domain.com
MAILCHANNELS_FROM_NAME="PatchX"
MAILCHANNELS_REPLY_TO_EMAIL=patchx@your-domain.com   # 可选
MAILCHANNELS_API_ENDPOINT=https://api.mailchannels.net/tx/v1/send   # 可选覆写
MAILCHANNELS_API_KEY=your-api-key-here   # 付费计划必需
```

**安全提示：** 对于生产环境，建议使用 Cloudflare Workers 密钥：

```bash
# 设置为密钥（不在 wrangler.toml 中）
wrangler secret put MAILCHANNELS_API_KEY
```

#### 测试邮件配置

配置完成后，您可以从设置页面测试您的邮件设置：
1. 导航到设置页面
2. 滚动到"邮件配置测试"部分
3. 输入测试邮箱地址
4. 点击"发送测试邮件"

测试将验证您的邮件配置（Resend 或 MailChannels）是否正常工作。如果配置了 Resend，将使用 Resend；否则将回退到 MailChannels API。

### 前端环境变量（Vite）

为避免端点硬编码并按环境区分配置，请设置前端用于访问后端 Worker 的基地址：

```bash
VITE_WORKER_BASE_URL=https://patchx-service.angersax.workers.dev
```

登录页面将调用 `${VITE_WORKER_BASE_URL}/api/auth/login`，可在不同环境设置不同值（如 staging/production）。

#### Cloudflare Pages：Supabase 环境变量配置

**推荐方式：使用 Worker 配置端点（自动）**

最简单的方式是让 Worker 通过 `/api/config/public` 端点提供 Supabase 配置：

1. 确保 `.env.local` 包含 `SUPABASE_URL`、`SUPABASE_ANON_KEY`，以及可选的 `LITELLM_BASE_URL` 和 `LITELLM_API_KEY`
2. 运行同步脚本将环境变量同步到 `wrangler.toml`：
   ```bash
   npm run sync:env
   ```
3. 部署 Worker 后，前端会自动从 `/api/config/public` 端点获取配置

**替代方式：在 Cloudflare Pages 仪表板中手动设置**

如果您更喜欢在 Cloudflare Pages 中直接设置：

1. 进入 Cloudflare Pages → 选择项目 → Settings → Environment variables
2. 在 "Production" 与 "Preview"（按需）添加以下变量：
   - `SUPABASE_URL` → `https://<your-project>.supabase.co`
   - `SUPABASE_ANON_KEY` → `<your_anon_key>`
   - `VITE_PUBLIC_SITE_URL` → 对外访问地址（如 `https://patchx.pages.dev`）
   - `LITELLM_BASE_URL` → `https://<your-litellm-server>.com`（可选，用于模型选择功能）
   - `LITELLM_API_KEY` → `<your-litellm-api-key>`（可选，用于模型选择功能）
3. 重新部署 Pages 项目使新的环境变量生效。

说明：
- Vite 仅会将以 `VITE_` 开头的变量暴露到前端代码；Supabase 的 anon key 设计为公开可在前端使用。请勿在前端使用 service role key。
- 如果未在 Cloudflare Pages 中设置环境变量，前端会自动回退到 Worker 的 `/api/config/public` 端点。

#### Cloudflare Workers：通过 `wrangler.toml` 配置 Supabase

在 Workers 端配置 Supabase，并由前端在运行时拉取：

1. 在 `wrangler.toml` 增加变量（或使用 `npm run sync:env` 自动同步）：
```toml
[env.production.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"
LITELLM_BASE_URL = "https://<your-litellm-server>.com"
LITELLM_API_KEY = "<your-litellm-api-key>"

[env.staging.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"
LITELLM_BASE_URL = "https://<your-litellm-server>.com"
LITELLM_API_KEY = "<your-litellm-api-key>"
```
2. Worker 提供公共配置端点 `/api/config/public`，返回 `{ supabaseUrl, supabaseAnonKey }`。
3. 前端采用惰性初始化 Supabase，当未设置 `SUPABASE_*` 时将回退到该端点。

### 远程节点配置

远程节点允许您通过 SSH 在远程服务器上执行 git 操作。这对于在远程构建服务器上应用补丁和管理 git 仓库非常有用。

#### 功能特性

- **SSH 连接管理**: 配置远程服务器的主机、端口和用户名
- **身份认证**: 支持 SSH 密钥和密码两种认证方式
- **工作主目录**: 为 git 操作指定工作目录路径
- **连接测试**: 测试 SSH 连接并验证工作主目录
- **Supabase 存储**: 远程节点配置存储在 Supabase 数据库中

#### 设置远程节点

1. **访问设置页面**: 导航到设置页面（仅管理员）
2. **添加远程节点**: 点击"添加远程节点"按钮
3. **配置节点**:
   - **名称**: 节点的描述性名称（例如："Ubuntu 构建服务器 1"）
   - **主机**: 远程服务器的 IP 地址或主机名
   - **端口**: SSH 端口（默认：22）
   - **用户名**: SSH 用户名
   - **工作主目录**: 可选的工作目录路径（例如：`/home/username/my-tmp/patchx`）
   - **SSH Service API URL**: 可选的 SSH 服务 API URL，用于执行命令（例如：`https://your-ssh-service.com/api/ssh`）
   - **SSH Service API Key**: 可选的 API 密钥，用于 SSH 服务 API 认证
   - **认证类型**: 选择 SSH 密钥或密码
   - **SSH 密钥/密码**: 提供认证凭据

4. **测试连接**: 点击"测试连接"以验证：
   - SSH 连接性（主机、端口、横幅、延迟）
   - 工作主目录（如果配置了 SSH Service API URL）

#### SSH 服务 API 配置（可选）

为了验证工作主目录和执行 git 操作，您可以按节点配置外部 SSH 服务 API：

1. **在设置页面中配置**: 添加或编辑远程节点时，填写：
   - **SSH Service API URL**: 您的 SSH 服务 API 端点 URL（例如：`https://your-domain.com/api/ssh`）
     - **注意**：请提供以 `/api/ssh` 结尾的基础 URL（不包含 `/execute`）。系统在发起请求时会自动追加 `/execute`。
   - **SSH Service API Key**: 用于认证的 API 密钥（可选，但如果您的 SSH 服务需要认证，则推荐配置）

2. **SSH 服务 API 要求**:
   - 端点: `POST /execute`
   - 请求体:
     ```json
     {
       "host": "string",
       "port": number,
       "username": "string",
       "authType": "key" | "password",
       "sshKey": "string",
       "password": "string",
       "command": "string"
     }
     ```
   - 响应:
     ```json
     {
       "success": boolean,
       "output": "string",
       "error": "string"
     }
     ```
   - 认证: 如果提供了 API 密钥，Worker 将发送 `Authorization: Bearer <api-key>` 请求头

3. **每节点配置的优势**:
   - 每个节点可以使用不同的 SSH 服务端点
   - API 密钥安全地存储在 Supabase 中，每个节点独立
   - 更好的组织性和灵活性

4. **没有 SSH 服务 API**: 连接测试仍会验证 SSH 连接性，但工作主目录验证和 git 操作将被跳过。

#### 数据库设置

运行数据库重置脚本时会自动创建 `remote_nodes` 表：

```bash
./scripts/reset-db.sh --confirm
```

该表包括：
- 节点元数据（名称、主机、端口、用户名）
- 认证凭据（SSH 密钥或密码）
- 工作主目录路径
- SSH 服务 API 配置（SSH Service API URL 和 Key）
- 时间戳（created_at, updated_at）

#### 使用远程节点

提交补丁时：
1. 从下拉菜单中选择远程节点（可选）
2. 如果选择了远程节点，请提供 Git 仓库 URL
3. 系统将在远程节点上执行 git 操作：
   - 克隆仓库
   - 应用补丁
   - 如有需要，执行冲突解决
   - 提交并推送更改

### Gerrit 配置

在 Cloudflare Workers 中配置与 AOSP Gerrit 交互所需的环境变量与密钥。

**选项 1：从 .env.local 同步（推荐）**

1. 在 `.env.local` 中添加 Gerrit 凭据和缓存版本：
   ```bash
   GERRIT_BASE_URL=https://android-review.googlesource.com
   GERRIT_USERNAME=your-gerrit-username
   GERRIT_PASSWORD=your-gerrit-password-or-token
   CACHE_VERSION=v1
   ```

2. 同步到 `wrangler.toml`：
   ```bash
   npm run sync:env
   ```

3. 部署 Worker：
   ```bash
   npm run deploy
   ```

**注意：** `sync:env` 脚本也会将 `CACHE_VERSION` 从 `.env.local` 同步到 `wrangler.toml`。更新 `CACHE_VERSION`（例如改为 `v2`）并重新部署，可以清除所有项目和分支的缓存响应。

**选项 2：手动配置**

或者，手动配置 Gerrit 凭据：

```bash
# Gerrit 基本配置（wrangler.toml 中 vars）
GERRIT_BASE_URL=https://android-review.googlesource.com
MAX_FILE_SIZE=10485760           # 10MB
RATE_LIMIT_WINDOW=900000         # 15分钟（毫秒）
RATE_LIMIT_MAX=10                # 窗口内最大请求数

# Gerrit 凭据（生产环境使用 Wrangler Secrets 存储）
# 开发环境可以在 wrangler.toml 中使用 vars
# 生产环境的敏感信息应使用 secrets 管理：
wrangler secret put GERRIT_USERNAME
wrangler secret put GERRIT_PASSWORD
```

**注意：** `sync:env` 脚本会自动将 `GERRIT_USERNAME` 和 `GERRIT_PASSWORD` 作为 vars 添加到 `wrangler.toml`。对于生产环境部署，建议使用 Wrangler secrets 以获得更好的安全性：

```bash
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

#### 获取 Gerrit 项目列表
```
GET /api/projects
```

查询参数（可选）：
- `prefix` - 按前缀过滤项目（区分大小写）
- `substring` - 按子字符串过滤项目（不区分大小写）
- `regex` - 按正则表达式过滤项目
- `limit` - 限制结果数量
- `skip` - 跳过结果数量
- `all` - 包含隐藏项目（默认：false，**注意：** 大多数 Gerrit 实例中此选项已被禁用）
- `state` - 按状态过滤：ACTIVE、READ_ONLY 或 HIDDEN
- `type` - 按类型过滤：ALL、CODE 或 PERMISSIONS
- `description` - 包含项目描述（默认：false）

示例：
```
GET /api/projects?description=true
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "platform/frameworks/base",
      "name": "platform/frameworks/base",
      "description": "Android framework base"
    },
    {
      "id": "platform/packages/apps/Settings",
      "name": "platform/packages/apps/Settings",
      "description": "Settings app"
    }
  ]
}
```

#### 获取项目的分支列表
```
GET /api/projects/:project/branches
```

路径参数：
- `project` - 项目名称（URL 编码，例如：`platform%2Fframeworks%2Fbase`）

示例：
```
GET /api/projects/platform%2Fframeworks%2Fbase/branches
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "ref": "refs/heads/main",
      "revision": "abc123def456...",
      "name": "main"
    },
    {
      "ref": "refs/heads/master",
      "revision": "def456abc123...",
      "name": "master"
    },
    {
      "ref": "refs/heads/android14-release",
      "revision": "789ghi012jkl...",
      "name": "android14-release"
    }
  ]
}
```

**注意：** 当在提交页面选择项目时，分支会自动获取并显示。在选择项目之前，分支下拉框处于禁用状态。"目标项目"和"目标分支"下拉框均支持实时搜索和过滤功能，帮助用户快速找到所需的项目或分支。

**缓存机制：**
- **客户端缓存：** 项目和分支数据会在浏览器本地缓存 10 分钟，以提升性能。用户可以通过"目标项目"和"目标分支"下拉框旁边的刷新按钮（🔄）手动刷新缓存。缓存数据通过 localStorage 持久化，页面刷新后仍然有效。
- **服务端缓存：** Worker 也会缓存 API 响应 10 分钟，以减少对 Gerrit 的调用。要在部署时清除所有服务端缓存，请在 `.env.local` 中更新 `CACHE_VERSION`（例如从 `v1` 改为 `v2`），运行 `npm run sync:env`，然后重新部署。

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

**重要提示：部署时的环境变量配置**

您有**两种选择**来配置 Supabase 环境变量：

#### 选项 1：使用 Worker 的配置端点（推荐 - 自动）

Worker 可以通过 `/api/config/public` 暴露 Supabase 配置，前端会自动将其作为后备方案使用。这意味着您无需在 Cloudflare Pages 仪表板中设置环境变量。

**步骤：**
1. 确保您的 `.env.local` 包含 `SUPABASE_URL`、`SUPABASE_ANON_KEY`，可选的 `LITELLM_BASE_URL` 和 `LITELLM_API_KEY`，可选的 `GERRIT_USERNAME` 和 `GERRIT_PASSWORD`，以及可选的 `CACHE_VERSION`（默认为 `v1`）
2. 将它们同步到 `wrangler.toml`：
   ```bash
   npm run sync:env
   ```
3. 部署 Worker：
   ```bash
   npm run deploy
   ```
4. 前端将自动从 Worker 的 `/api/config/public` 端点获取配置

**注意：** 要在部署时清除服务端缓存，请在 `.env.local` 中更新 `CACHE_VERSION`（例如改为 `v2`），运行 `npm run sync:env`，然后重新部署。

#### 选项 2：在 Cloudflare Pages 仪表板中设置（手动）

或者，您可以在 Cloudflare Pages 中设置环境变量：

1. 进入您的 Cloudflare Pages 项目仪表板
2. 导航到 **设置** → **环境变量**
3. 为 **生产环境**（以及 **预览环境**，如需要）添加以下变量：
   - `SUPABASE_URL` - 您的 Supabase 项目 URL（例如：`https://your-project.supabase.co`）
   - `SUPABASE_ANON_KEY` - 您的 Supabase 匿名密钥
   - `VITE_PUBLIC_SITE_URL` - 您的站点公网地址（例如：`https://patchx.pages.dev`）
   - `LITELLM_BASE_URL` - 您的 LiteLLM 服务器 URL（可选，用于模型选择功能）
   - `LITELLM_API_KEY` - 您的 LiteLLM API 密钥（可选，用于模型选择功能）

**⚠️ 关键提示：** 如果这些环境变量缺失或指向不同的 Supabase 项目，用户在重新部署后将无法登录。数据库重置脚本在部署过程中**永远不会**被调用，因此如果登录失败，请检查：

1. 环境变量设置正确（通过 Worker 的 `wrangler.toml` 或在 Cloudflare Pages 仪表板中）
2. 环境变量指向正确的 Supabase 项目
3. Supabase 项目未通过 Supabase 仪表板手动重置
4. Supabase 项目 URL 和密钥未更改

### 部署后的服务地址
- **前端（Cloudflare Pages）**: `https://patchx.pages.dev`
- **后端 API（Cloudflare Workers）**: `https://patchx-service.angersax.workers.dev`

### 自动重定向配置
前端通过 `_redirects` 文件自动将 `/api/*` 请求转发到后端 Workers，无需修改前端代码。

## 📄 许可证

Apache-2.0
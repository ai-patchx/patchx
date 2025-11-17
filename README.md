# AOSP Patch Submission Service

一个用于简化Android开源项目(AOSP)代码贡献流程的Web服务，支持AI驱动的patch冲突解决。

## 🚀 功能特性

- 📤 **文件上传**: 支持拖拽上传Git patch文件
- ✅ **格式验证**: 自动验证patch文件格式
- 🤖 **AI冲突解决**: 智能分析和解决代码冲突
- 🔄 **自动提交**: 自动提交到Google AOSP Gerrit
- 📊 **状态跟踪**: 实时显示提交进度和结果
- 📱 **响应式设计**: 支持桌面和移动设备

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **后端**: Cloudflare Workers + TypeScript
- **AI集成**: 支持OpenAI、Anthropic等第三方大模型
- **存储**: Cloudflare KV
- **部署**: Cloudflare Workers + Pages

## 🤖 AI冲突解决特性

### 支持的AI提供商
- **OpenAI**: GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3 Sonnet, Claude 3 Haiku
- **自定义**: 支持OpenAI API兼容的任何提供商

### AI功能
- **智能冲突检测**: 自动识别patch中的代码冲突
- **多提供商对比**: 同时使用多个AI提供商，选择最佳解决方案
- **置信度评估**: AI解决方案的可信度评分
- **人工审查建议**: 标记需要人工确认的复杂冲突

## 📦 安装和运行

### 本地开发

本项目采用前后端分离架构，需要同时运行两个开发服务器：

#### 终端 1: 前端开发服务器 (Vite)
```bash
# 安装依赖
npm install

# 格式化
npm run lint -- --fix

# 启动前端开发服务器
npm run dev
# 访问: http://localhost:5173
```

#### 终端 2: 后端 API 服务器 (Wrangler)
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

### Cloudflare Workers开发

```bash
# 安装Wrangler
npm install -g wrangler

# 登录Cloudflare
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
| **Vite Dev Server** | 5173 | 前端React应用 | http://localhost:5173 |
| **Wrangler Dev Server** | 8787 | 后端API Worker | http://127.0.0.1:8787 |

### 常见问题

**Q: 为什么访问 `http://127.0.0.1:8787` 显示404？**
A: Wrangler服务器只提供API端点，没有根路径路由。请访问具体的API端点，如：
- `http://127.0.0.1:8787/api/ai/providers`
- `http://127.0.0.1:8787/api/upload`

**Q: 如何测试API是否正常工作？**
A: 可以使用以下命令测试API：
```bash
# 测试AI提供商列表
Invoke-WebRequest -Uri http://127.0.0.1:8787/api/ai/providers -Method GET

# 或者使用curl（如果已安装）
curl http://127.0.0.1:8787/api/ai/providers
```

## 🔧 AI配置

### 环境变量配置

在Cloudflare Workers中设置以下AI相关的环境变量：

```bash
# OpenAI配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.1

# Anthropic配置
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=2000
ANTHROPIC_TEMPERATURE=0.1

# 自定义AI提供商（兼容OpenAI API）
CUSTOM_AI_BASE_URL=https://your-custom-ai-provider.com/v1
CUSTOM_AI_API_KEY=your-custom-api-key
CUSTOM_AI_MODEL=gpt-3.5-turbo
CUSTOM_AI_MAX_TOKENS=2000
CUSTOM_AI_TEMPERATURE=0.1
```

### Gerrit配置

在Cloudflare Workers中配置与AOSP Gerrit交互所需的环境变量与密钥：

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

### AI功能启用

AI冲突解决功能会根据配置自动启用：

1. **自动检测**: 系统会自动检测可用的AI提供商
2. **多提供商模式**: 可以同时配置多个AI提供商进行对比
3. **智能选择**: 系统会选择置信度最高的AI解决方案

## 📋 API文档

### AI冲突解决API

#### 解决代码冲突
```
POST /api/ai/resolve-conflict
```

Request:
```json
{
  "originalCode": "原始代码内容",
  "incomingCode": "传入的patch代码",
  "currentCode": "当前代码内容",
  "filePath": "文件路径",
  "provider": "openai", // 可选，指定AI提供商
  "useMultipleProviders": true // 可选，使用多个提供商对比
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

#### 获取AI提供商列表
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
    "message": "AI冲突解决已启用"
  }
}
```

#### 测试AI提供商
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
- 创建Cloudflare账户
- 安装Wrangler CLI
- 配置KV命名空间

### 2. AI提供商配置
- 获取OpenAI API密钥
- 获取Anthropic API密钥（可选）
- 配置自定义AI提供商（可选）

### 3. 环境变量设置
在Cloudflare Workers设置页面添加所有必要的环境变量。

### 4. 后端部署 (Cloudflare Workers)
```bash
# 构建 Worker
npm run build:worker

# 部署到 Cloudflare Workers
wrangler deploy
```

### 5. 前端部署 (Cloudflare Pages)
```bash
# 构建前端
npm run build

# 部署到 Cloudflare Pages
wrangler pages deploy dist --project-name=patchx
```

### 部署后的服务地址
- **前端 (Cloudflare Pages)**: `https://patchx.pages.dev`
- **后端 API (Cloudflare Workers)**: `https://patchx-service.angersax.workers.dev`

### 自动重定向配置
前端通过 `_redirects` 文件自动将 `/api/*` 请求转发到后端 Workers，无需修改前端代码。

## 💡 使用建议

### AI冲突解决最佳实践

1. **多提供商对比**: 启用多个AI提供商以获得更好的解决方案
2. **置信度评估**: 关注AI解决方案的置信度评分
3. **人工审查**: 对于复杂冲突，始终进行人工审查
4. **测试验证**: 应用AI解决方案后，充分测试代码功能

### 性能优化

1. **缓存策略**: 对相似的冲突结果进行缓存
2. **超时设置**: 为AI调用设置合理的超时时间
3. **并发控制**: 限制同时进行的AI请求数量
4. **错误重试**: 实现智能的错误重试机制

## 🔒 安全考虑

- **API密钥保护**: 所有AI提供商的API密钥都存储在环境变量中
- **请求限制**: 实现速率限制防止滥用
- **内容过滤**: 对输入和输出进行适当的内容检查
- **审计日志**: 记录所有AI冲突解决操作

## 📄 许可证

MIT License

# PatchX

**English** | [中文](README_cn.md)

A web service that streamlines contributing code to the Android Open Source Project (AOSP), with AI‑driven patch conflict resolution.

## 🚀 Features

- 📤 File upload: drag and drop Git patch files
- ✅ Format validation: automatically validate patch file format
- 🤖 AI conflict resolution: intelligently analyze and resolve code conflicts
- 🔄 Auto submission: push to Google AOSP Gerrit
- 📊 Status tracking: real‑time submission progress and results
- 📱 Responsive design: desktop and mobile support
- 🔐 User login and token‑based authentication
- 🧑‍💻 User registration: Email only (Supabase)

## 🛠️ Tech Stack

- Frontend: React 18 + TypeScript + Tailwind CSS
- Backend: Cloudflare Workers + TypeScript
- AI integration: OpenAI, Anthropic, and any OpenAI‑compatible providers
- Storage: Cloudflare KV
- Deployment: Cloudflare Workers + Pages

## 🤖 AI Conflict Resolution

### Supported AI Providers
- OpenAI: GPT‑4, GPT‑3.5 Turbo
- Anthropic: Claude 3 Sonnet, Claude 3 Haiku
- Custom: any provider compatible with the OpenAI API

### AI Capabilities
- Intelligent conflict detection
- Multi‑provider comparison to select the best solution
- Confidence scoring for AI solutions
- Human review suggestions for complex conflicts

## 📦 Installation & Run

### Local Development

This project uses a decoupled frontend and backend; run two development servers:

#### Terminal 1: Frontend Dev Server (Vite)
```bash
# Install dependencies
npm install

# Format
npm run lint -- --fix

# Start frontend dev server
npm run dev
# Visit: http://localhost:5173
```

Set the test account password in Cloudflare Workers as a secret (Wrangler Secrets):

```bash
wrangler secret put TEST_USER_PASSWORD
```

### Authentication & Registration (Local dev)

- Homepage provides Login/Registration modal
- Email registration only via Supabase
- After registration, users receive an 8-digit verification code via email
- Enter the verification code in the registration modal to complete account setup

**Important:** To use verification codes instead of confirmation links, you must configure your Supabase email templates:
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Edit the "Confirm Signup" template
3. Replace `{{ .ConfirmationURL }}` with `{{ .Token }}` to display the verification code
4. See `SUPABASE_EMAIL_TEMPLATE_SETUP.md` for detailed instructions

Copy `.env.example` to `.env.local` and set:
```bash
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_SITE_URL=http://localhost:5173
```
`VITE_PUBLIC_SITE_URL` is used for email verification. For local development, you can keep it as `http://localhost:5173`. In deployed environments, set it to your public site URL (e.g., `https://patchx.pages.dev`).

Legacy test account (for Worker API testing only):
- Default test account: `username=patchx`, `password=patchx`
- Override password via `TEST_USER_PASSWORD`
Examples:
- PowerShell (Windows):
```powershell
$env:TEST_USER_PASSWORD="your_password"; npm run dev
```
- Vite helper script:
```bash
npm run dev:env  # starts dev with TEST_USER_PASSWORD=test123
```

#### Terminal 2: Backend API Server (Wrangler)
```bash
# Build Cloudflare Worker (API)
npm run build:worker

# Start backend API dev server
wrangler dev
# API endpoint: http://127.0.0.1:8787
```

Note: Both servers must run to use all features. The frontend communicates with the backend via API calls.

### Code Checks
```bash
# Run ESLint
npm run lint

# Run TypeScript type checks
npm run check
```

### Build & Deploy

```bash
# Build frontend
npm run build

# Build Cloudflare Worker (API)
npm run build:worker
```

### Cloudflare Workers Development

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

**Authentication Options:**

For Ubuntu/WSL users, using an API token is recommended (avoids browser interaction):

1. Get your API token from: https://dash.cloudflare.com/profile/api-tokens
2. Set the environment variable:
   ```bash
   export CLOUDFLARE_API_TOKEN='your-api-token-here'
   ```
3. Make it persistent (add to your shell config):
   ```bash
   # For bash
   echo 'export CLOUDFLARE_API_TOKEN="your-api-token-here"' >> ~/.bashrc
   source ~/.bashrc

   # For zsh
   echo 'export CLOUDFLARE_API_TOKEN="your-api-token-here"' >> ~/.zshrc
   source ~/.zshrc
   ```
4. Verify authentication:
   ```bash
   npx wrangler whoami
   ```

**Note:** Once `CLOUDFLARE_API_TOKEN` is set, wrangler will automatically use it for authentication. You don't need to run `wrangler login` when using the API token method.

```bash
# Local development (API Worker)
npm run build:worker
wrangler dev

# Deploy to production (API Worker)
npm run build:worker
wrangler deploy
# Or use the deploy script:
npm run deploy
```

**Note:** `wrangler deploy` does NOT reset the database. Database reset is available separately via the scripts below.

### Database Management

#### Reset Database

The database reset functionality is available as an optional script and is **never** executed during `wrangler deploy`.

**Using npm scripts:**
```bash
# Authenticate with Supabase
npx supabase login

# Reset database with confirmation prompt
npm run db:reset

# Reset database without confirmation (use with caution)
npm run db:reset:confirm
```

**Environment Variables:**

Create (or update) `.env.local` using `.env.example` as a template and include:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_SITE_URL=https://patchx.pages.dev
```

The script automatically extracts the project reference from `SUPABASE_URL`, so you don't need to set `SUPABASE_PROJECT_REF` separately.

**Alternative: Direct Database Connection**

If you prefer not to authenticate, you can use a direct database connection by adding `DATABASE_URL` to `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

You can find your database password in the Supabase Dashboard under **Settings** → **Database** → **Connection string**.

**Important:**
- Database reset is **never** executed during `wrangler deploy` or Cloudflare Pages deployment
- Always backup your data before resetting
- The reset script requires explicit confirmation unless `--confirm` is used
- For remote projects, authentication via `npx supabase login` is required (unless using `DATABASE_URL`)

**Troubleshooting: Can't login after redeploy?**

If users can't login after redeploying to Cloudflare, check:

1. **Environment Variables in Cloudflare Pages:**
   - Go to Cloudflare Pages dashboard → Your project → Settings → Environment Variables
   - Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set for Production environment
   - Ensure they point to the **same** Supabase project where users registered

2. **Supabase Project:**
   - Check if the Supabase project was reset manually in Supabase dashboard
   - Verify the project URL and keys haven't changed
   - Confirm the user account exists in the Supabase Auth users table

3. **Environment Variable Mismatch:**
   - Local development uses `.env.local` file
   - Cloudflare Pages uses environment variables set in the dashboard
   - These must match the same Supabase project

**Note:** The database reset script (`scripts/reset-db.sh`) is **never** automatically called during deployment. If login fails, it's almost always an environment variable configuration issue.

## 🔄 Dev Servers

### Server Differences

| Server | Port | Purpose | Address |
|--------|------|---------|---------|
| Vite Dev Server | 5173 | Frontend React app | http://localhost:5173 |
| Wrangler Dev Server | 8787 | Backend API Worker | http://127.0.0.1:8787 |

### FAQ

**Q: Why does `http://127.0.0.1:8787` show 404?**
A: The Wrangler dev server only exposes API routes and has no root path route. Access specific API endpoints such as:
- `http://127.0.0.1:8787/api/ai/providers`
- `http://127.0.0.1:8787/api/upload`

**Q: How can I test whether the API works?**
Use the following commands:
```bash
# Test AI providers list (PowerShell)
Invoke-WebRequest -Uri http://127.0.0.1:8787/api/ai/providers -Method GET

# Or curl (if installed)
curl http://127.0.0.1:8787/api/ai/providers
```

## 🔧 AI Configuration

### Environment Variables

Set the following AI‑related environment variables in Cloudflare Workers:

```bash
# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.1

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_MODEL=claude-3-sonnet-20240229
ANTHROPIC_MAX_TOKENS=2000
ANTHROPIC_TEMPERATURE=0.1

# Custom AI provider (OpenAI API compatible)
CUSTOM_AI_BASE_URL=https://your-custom-ai-provider.com/v1
CUSTOM_AI_API_KEY=your-custom-api-key
CUSTOM_AI_MODEL=gpt-3.5-turbo
CUSTOM_AI_MAX_TOKENS=2000
CUSTOM_AI_TEMPERATURE=0.1

# Authentication
TEST_USER_PASSWORD=your-secure-password

# Supabase (frontend)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Frontend environment (Vite)

Set the frontend base URL for the backend Worker to avoid hardcoded endpoints and enable per‑environment configuration:

```bash
VITE_WORKER_BASE_URL=https://patchx-service.angersax.workers.dev
```

The login page calls `${VITE_WORKER_BASE_URL}/api/auth/login`. Provide different values for staging/production as needed.

#### Cloudflare Pages: Supabase environment configuration

Configure Supabase environment variables for the frontend build in your Cloudflare Pages project settings:

1. Go to Cloudflare Pages → your project → Settings → Environment variables
2. Add the following variables under both "Production" and "Preview" (as needed):
   - `SUPABASE_URL` → `https://<your-project>.supabase.co`
   - `SUPABASE_ANON_KEY` → `<your_anon_key>`
   - `VITE_PUBLIC_SITE_URL` → public URL of your site (e.g. `https://patchx.pages.dev`)
3. Redeploy the Pages project so the new variables are applied to the build.

Notes:
- Vite exposes variables that begin with `VITE_` to client code; the Supabase anon key is designed to be public and safe for client-side use. Do NOT use service role keys in the frontend.

#### Cloudflare Workers: Configure Supabase via `wrangler.toml`

You can configure Supabase values on the Worker side and have the frontend fetch them at runtime.

1. Add vars in `wrangler.toml`:
```toml
[env.production.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"

[env.staging.vars]
SUPABASE_URL = "https://<your-project>.supabase.co"
SUPABASE_ANON_KEY = "<your_anon_key>"
```
2. The Worker exposes a public config endpoint at `/api/config/public` returning `{ supabaseUrl, supabaseAnonKey }`.
3. The frontend lazily initializes Supabase and falls back to this endpoint if `SUPABASE_*` are not set.

### Gerrit Configuration

Configure environment variables and secrets needed to interact with AOSP Gerrit in Cloudflare Workers:

```bash
# Gerrit basics (vars in wrangler.toml)
GERRIT_BASE_URL=https://android-review.googlesource.com
MAX_FILE_SIZE=10485760           # 10MB
RATE_LIMIT_WINDOW=900000         # 15 minutes (ms)
RATE_LIMIT_MAX=10                # max requests per window

# Gerrit credentials (store via Wrangler Secrets)
# Sensitive information must be managed as secrets
wrangler secret put GERRIT_USERNAME
wrangler secret put GERRIT_PASSWORD

# AI provider secrets (also via secrets)
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put CUSTOM_AI_API_KEY
```

### KV Namespaces

Bind KV namespaces in `wrangler.toml`:

```toml
[env.production]
kv_namespaces = [
  { binding = "AOSP_PATCH_KV", id = "<your_kv_id>" }
]
```

### AI Feature Activation

AI conflict resolution is enabled based on configuration:

1. Auto detection of available providers
2. Multi‑provider mode for comparison
3. Smart selection of the highest‑confidence solution

## 📋 API Documentation

### Authentication API

#### Login
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
  "message": "Login successful"
}
```

#### Current user (requires auth)
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
  "message": "OK"
}
```

Notes:
- Protected endpoints require the `Authorization: Bearer <token>` header.
- The frontend automatically adds the header when authenticated.

### AI Conflict Resolution API

#### Resolve code conflicts
```
POST /api/ai/resolve-conflict
```

Request:
```json
{
  "originalCode": "Original code content",
  "incomingCode": "Patch code",
  "currentCode": "Current code content",
  "filePath": "File path",
  "provider": "openai",
  "useMultipleProviders": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "resolvedCode": "Resolved code",
    "explanation": "Resolution strategy explanation",
    "confidence": 0.85,
    "suggestions": ["Suggestion 1", "Suggestion 2"],
    "requiresManualReview": false
  }
}
```

### Patch Upload & Submission API

#### Upload patch file
```
POST /api/upload
```

Request (`multipart/form-data`):
- `file`: Git patch file
- `project`: Target project (e.g., `platform/frameworks/base`)

Response:
```json
{
  "success": true,
  "data": {
    "uploadId": "<id>",
    "status": "success",
    "message": "File uploaded successfully"
  }
}
```

#### Create submission and push to Gerrit asynchronously
```
POST /api/submit
```

Request (`application/json`):
```json
{
  "uploadId": "<id>",
  "subject": "Commit title",
  "description": "Commit description",
  "branch": "refs/heads/master"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "submissionId": "<id>",
    "status": "processing"
  }
}
```

#### Query submission status
```
GET /api/status/<submissionId>
```

Response:
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

#### Get AI providers list
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
    "message": "AI conflict resolution is enabled"
  }
}
```

#### Test AI providers
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

## 🚀 Deployment Steps

### 1. Basics
- Create a Cloudflare account
- Install the Wrangler CLI
- Configure KV namespaces

### 2. AI Provider Setup
- Obtain an OpenAI API key
- Obtain an Anthropic API key (optional)
- Configure a custom AI provider (optional)

### 3. Environment Variables
Add all required environment variables in the Cloudflare Workers settings.

### 4. Backend Deployment (Cloudflare Workers)
```bash
# Build the Worker
npm run build:worker

# Deploy to Cloudflare Workers
wrangler deploy
```

### 5. Frontend Deployment (Cloudflare Pages)
```bash
# Build the frontend
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy dist --project-name=patchx
```

**IMPORTANT: Environment Variables for Deployment**

You have **two options** for configuring Supabase environment variables:

### Option 1: Use Worker's Config Endpoint (Recommended - Automatic)

The Worker can expose Supabase config via `/api/config/public`, and the frontend will automatically use it as a fallback. This means you don't need to set environment variables in Cloudflare Pages dashboard.

**Steps:**
1. Ensure your `.env.local` has `SUPABASE_URL` and `SUPABASE_ANON_KEY`
2. Sync them to `wrangler.toml`:
   ```bash
   npm run sync:env
   ```
3. Deploy the Worker:
   ```bash
   npm run deploy
   ```
4. The frontend will automatically fetch config from the Worker's `/api/config/public` endpoint

### Option 2: Set in Cloudflare Pages Dashboard (Manual)

Alternatively, you can set environment variables in Cloudflare Pages:

1. Go to your Cloudflare Pages project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables for **Production** (and **Preview** if needed):
   - `SUPABASE_URL` - Your Supabase project URL (e.g., `https://your-project.supabase.co`)
   - `SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `VITE_PUBLIC_SITE_URL` - Public URL of your site (e.g., `https://patchx.pages.dev`)

**⚠️ Critical:** If these environment variables are missing or point to a different Supabase project, users will not be able to login after redeployment. The database reset script is **never** called during deployment, so if login fails, check:

1. Environment variables are set correctly (either in Worker via `wrangler.toml` or in Cloudflare Pages dashboard)
2. Environment variables point to the correct Supabase project
3. The Supabase project hasn't been reset manually through Supabase dashboard
4. The Supabase project URL and keys haven't changed

### Post‑deployment URLs
- Frontend (Cloudflare Pages): `https://patchx.pages.dev`
- Backend API (Cloudflare Workers): `https://patchx-service.angersax.workers.dev`

### Automatic redirects
The frontend uses a `_redirects` file to forward `/api/*` requests to the backend Workers. No frontend code changes are required.

## 📄 License

Apache-2.0

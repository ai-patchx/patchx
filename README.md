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
- 🔐 User sign-in and token‑based authentication
- 🧑‍💻 User registration: Email-based authentication
- 📋 Dynamic project listing: automatically fetch all projects from Gerrit
- 🌿 Dynamic branch listing: automatically fetch branches for selected project
- 🔍 Searchable dropdowns: search and filter projects and branches with real-time filtering
- ⚡ Smart caching: projects and branches are cached locally for 10 minutes to improve performance and reduce API calls
- 🖥️ Remote node management: configure and manage SSH remote nodes for git operations
- 🔐 SSH authentication: support for both SSH key and password authentication
- 📁 Working directory: specify working home directory for remote git operations
- 🔄 Git repository cloning: clone git repositories on remote nodes with target project and branch support

## 🛠️ Tech Stack

- Frontend: React 18 + TypeScript + Tailwind CSS
- Backend: Cloudflare Workers + TypeScript
- AI integration: OpenAI, Anthropic, and any OpenAI‑compatible providers
- Storage: Cloudflare D1 (for remote nodes and app settings), Cloudflare KV (for caching)
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

Copy `.env.example` to `.env.local` and set:
```bash
VITE_PUBLIC_SITE_URL=http://localhost:5173
GERRIT_BASE_URL=https://android-review.googlesource.com
GERRIT_USERNAME=your-gerrit-username
GERRIT_PASSWORD=your-gerrit-password-or-token
CACHE_VERSION=v1
```

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

**Important:** If you have `CLOUDFLARE_API_TOKEN` set and try to run `wrangler login`, you'll get an error: "You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the environment to log in via OAuth." This is expected behavior. To use OAuth login instead:
```bash
# Unset the API token
unset CLOUDFLARE_API_TOKEN

# Then run OAuth login
wrangler login
```

To switch back to API token authentication:
```bash
# Set the token again
export CLOUDFLARE_API_TOKEN='your-api-token-here'
```

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

#### D1 Database Setup

PatchX uses Cloudflare D1 (SQLite) for storing remote node configurations and application settings.

**Initial Setup:**

1. **Create D1 Database:**
   ```bash
   # Create production database
   wrangler d1 create patchx-db

   # Create staging database (optional)
   wrangler d1 create patchx-db-staging
   ```

2. **Update wrangler.toml:**
   - Copy the `database_id` from the command output
   - Update `wrangler.toml` with the actual database IDs:
     ```toml
     [env.production]
     d1_databases = [
       { binding = "PATCHX_D1", database_name = "patchx-db", database_id = "your-actual-database-id" }
     ]
     ```

3. **Initialize Database:**
   ```bash
   # Initialize local database (creates tables if they don't exist)
   npm run db:init:confirm

   # Initialize remote production database
   bash scripts/reset-db.sh --init --env production --remote --confirm

   # Or reset database (drops and recreates all tables)
   npm run db:reset:confirm

   # Reset remote production database
   bash scripts/reset-db.sh --env production --remote --confirm
   ```

**Using npm scripts:**
```bash
# Initialize database with confirmation prompt
npm run db:init

# Initialize database without confirmation
npm run db:init:confirm

# Initialize remote database (without --env, uses patchx-db)
npm run db:init:remote

# Reset database with confirmation prompt
npm run db:reset

# Reset database without confirmation (use with caution)
npm run db:reset:confirm

# Reset remote database (without --env, uses patchx-db)
npm run db:reset:remote
```

**Environment-specific operations:**
```bash
# Initialize production database (local)
bash scripts/reset-db.sh --init --env production --confirm

# Initialize production database (remote)
bash scripts/reset-db.sh --init --env production --remote --confirm

# Reset staging database (local)
bash scripts/reset-db.sh --env staging --confirm

# Reset staging database (remote)
bash scripts/reset-db.sh --env staging --remote --confirm
```

**Local vs Remote Database:**
- **Local database**: Stored in `.wrangler/state/v3/d1` directory, used for local development
- **Remote database**: Cloudflare D1 database in your account, used for production/staging deployments
- Use `--remote` flag to operate on remote databases
- When using `--env production` or `--env staging`, the script uses the `DB` binding from `wrangler.toml`
- Without `--env`, the script uses the database name directly (e.g., `patchx-db`)

**Important:**
- Database operations are **never** executed during `wrangler deploy` or Cloudflare Pages deployment
- Always backup your data before resetting
- The reset script requires explicit confirmation unless `--confirm` is used
- D1 databases are bound to your Cloudflare account and accessible via the `DB` binding in your Worker

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

# Note: D1 database is configured in wrangler.toml via d1_databases binding
# No database connection strings needed in environment variables
```

### Email notification setup

Patch submission status emails are sent via [Resend](https://resend.com/) (free tier available) or MailChannels API (fallback).

#### Option 1: Resend (Recommended - Free Tier Available)

Resend offers a generous free tier:
- **3,000 emails per month**
- **100 emails per day**

#### Getting a Resend API Key

1. **Sign up for Resend:**
   - Visit [Resend](https://resend.com/) and create a free account
   - No credit card required for the free tier

2. **Get your API Key:**
   - Log into your Resend dashboard
   - Navigate to API Keys section
   - Create a new API key
   - Copy the API key (starts with `re_`)

3. **Verify your domain (required for sending):**
   - In Resend dashboard, go to Domains
   - Add and verify your sending domain
   - Follow DNS verification instructions
   - Ensure your `RESEND_FROM_EMAIL` uses a verified domain

#### Option 2: MailChannels API (Fallback)

**Important:** As of August 2024, MailChannels discontinued their free service for Cloudflare Workers. You now need to sign up for a MailChannels Email API plan to send emails.

#### Getting a MailChannels API Key

1. **Sign up for MailChannels Email API:**
   - Visit [MailChannels Email API](https://mailchannels.com/email-api) and sign up for a plan
   - Choose a plan that suits your email volume needs

2. **Get your API Key:**
   - Log into your MailChannels dashboard
   - Navigate to API Keys section
   - Create a new API key
   - Copy the API key (you won't be able to see it again)

3. **Verify your domain (if required):**
   - Some plans require domain verification
   - Follow MailChannels instructions to verify your sending domain
   - Ensure your `MAILCHANNELS_FROM_EMAIL` uses a verified domain

#### Resend Configuration

Configure the following variables in `wrangler.toml` (or the Cloudflare dashboard) for each environment:

```bash
RESEND_API_KEY=re_your-resend-api-key
RESEND_FROM_EMAIL=no-reply@your-domain.com
RESEND_FROM_NAME="PatchX"
RESEND_REPLY_TO_EMAIL=patchx@your-domain.com   # optional
```

**Security Note:** For production, consider using Cloudflare Workers secrets instead of storing the API key in `wrangler.toml`:

```bash
# Set as a secret (not in wrangler.toml)
wrangler secret put RESEND_API_KEY
```

Then access it in your worker code via `env.RESEND_API_KEY`.

#### MailChannels Configuration (Fallback)

If Resend is not configured, the system will fall back to MailChannels API:

```bash
MAILCHANNELS_FROM_EMAIL=no-reply@your-domain.com
MAILCHANNELS_FROM_NAME="PatchX"
MAILCHANNELS_REPLY_TO_EMAIL=patchx@your-domain.com   # optional
MAILCHANNELS_API_ENDPOINT=https://api.mailchannels.net/tx/v1/send   # optional override
MAILCHANNELS_API_KEY=your-api-key-here   # required for paid plans
```

**Security Note:** For production, consider using Cloudflare Workers secrets:

```bash
# Set as a secret (not in wrangler.toml)
wrangler secret put MAILCHANNELS_API_KEY
```

#### Testing Email Configuration

Once configured, you can test your email setup from the Settings page:
1. Navigate to Settings
2. Scroll to "Email Configuration Test" section
3. Enter a test email address
4. Click "Send Test Email"

The test will verify that your email configuration (Resend or MailChannels) is working correctly. If Resend is configured, it will be used; otherwise, it falls back to MailChannels API.

### Frontend environment (Vite)

Set the frontend base URL for the backend Worker to avoid hardcoded endpoints and enable per‑environment configuration:

```bash
VITE_WORKER_BASE_URL=https://patchx-service.angersax.workers.dev
```

The sign-in page calls `${VITE_WORKER_BASE_URL}/api/auth/login`. Provide different values for staging/production as needed.

#### Cloudflare Pages: Environment configuration

Configure environment variables for the frontend build in your Cloudflare Pages project settings:

1. Go to Cloudflare Pages → your project → Settings → Environment variables
2. Add the following variables under both "Production" and "Preview" (as needed):
   - `VITE_PUBLIC_SITE_URL` → public URL of your site (e.g. `https://patchx.pages.dev`)
3. Redeploy the Pages project so the new variables are applied to the build.

**Note:** LiteLLM configuration is now managed through the Settings page (admin only) and stored in D1 database, not via environment variables. See the LiteLLM Configuration section below.

#### Cloudflare Workers: Configure via `wrangler.toml`

You can configure environment values on the Worker side and have the frontend fetch them at runtime.

1. Sync environment variables from `.env.local` to `wrangler.toml`:
   ```bash
   npm run sync:env
   ```

2. The Worker exposes a public config endpoint at `/api/config/public` returning `{ publicSiteUrl }`.

3. D1 database is configured via `d1_databases` binding in `wrangler.toml`:
   ```toml
   [env.production]
   d1_databases = [
     { binding = "PATCHX_D1", database_name = "patchx-db", database_id = "your-database-id" }
   ]
   ```

### Remote Node Configuration

Remote nodes allow you to execute git operations on remote servers via SSH. This is useful for applying patches and managing git repositories on remote build servers.

#### Features

- **SSH Connection Management**: Configure remote servers with host, port, and username
- **Authentication**: Support for both SSH key and password authentication
- **Working Home Directory**: Specify a working directory path for git operations
- **Connection Testing**: Test SSH connectivity and verify working home directory
- **D1 Database Storage**: Remote node configurations are stored in Cloudflare D1 database

#### Setting Up Remote Nodes

1. **Access Settings Page**: Navigate to the Settings page (admin only)
2. **Add Remote Node**: Click "Add Remote Node" button
3. **Configure Node**:
   - **Name**: A descriptive name for the node (e.g., "Ubuntu Build Server 1")
   - **Host**: IP address or hostname of the remote server
   - **Port**: SSH port (default: 22)
   - **Username**: SSH username
   - **Working Home**: Optional working directory path (e.g., `/home/username/my-tmp/patchx`)
   - **SSH Service API URL**: Optional URL of the SSH service API for executing commands (e.g., `https://your-ssh-service.com/api/ssh` or `http://your-ip/api/ssh`)
   - **SSH Service API Key**: Optional API key for authenticating with the SSH service API
   - **Authentication Type**: Choose either SSH Key or Password
   - **SSH Key/Password**: Provide authentication credentials

4. **Test Connection**: Click "Test Connection" to verify:
   - SSH connectivity (host, port, banner, latency)
   - Working home directory (if SSH Service API URL is configured)

#### SSH Service API Configuration (Optional)

For working home directory verification and executing git operations, you can configure an external SSH service API per node:

1. **Configure in Settings Page**: When adding or editing a remote node, fill in:
   - **SSH Service API URL**: The URL of your SSH service API endpoint (e.g., `https://your-domain.com/api/ssh` or `http://your-ip/api/ssh`)
     - **Note**: Provide the base URL ending with `/api/ssh` (without `/execute`). The system will automatically append `/execute` when making requests.
     - **Port Configuration**: When using the provided nginx reverse proxy configuration (docker-compose.yml and nginx.conf), the SSH Service API uses standard ports 80 (HTTP) and 443 (HTTPS). Since 443 is the default HTTPS port, you don't need to include the port number in the URL (e.g., use `https://your-domain.com/api/ssh` instead of `https://your-domain.com:443/api/ssh`).
   - **SSH Service API Key**: The API key for authentication (optional, but recommended if your SSH service requires authentication)

2. **Docker Deployment Configuration**: If you deploy the SSH Service API using Docker Compose, you need to set the `GIT_WORK_DIR` environment variable to match the "Working Home" path configured for the remote node:
   ```bash
   # Set GIT_WORK_DIR to match the Remote Node's "Working Home" path
   export GIT_WORK_DIR=/home/your-user/git-work  # Replace with your actual Working Home path
   docker-compose up -d
   ```
   Or in a `.env` file:
   ```bash
   GIT_WORK_DIR=/home/your-user/git-work  # Must match "Working Home" in Remote Node settings
   ```

3. **SSH Service API Requirements**:
   - Endpoint: `POST /execute`
   - Request body:
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
   - Response:
     ```json
     {
       "success": boolean,
       "output": "string",
       "error": "string"
     }
     ```
   - Authentication: If API key is provided, the Worker will send `Authorization: Bearer <api-key>` header

4. **Benefits of Per-Node Configuration**:
   - Each node can use a different SSH service endpoint
   - API keys are stored securely in D1 database per node
   - Better organization and flexibility

5. **Without SSH Service API**: Connection test will still verify SSH connectivity, but working home verification and git operations will be skipped.

#### Database Setup

The `remote_nodes` and `app_settings` tables are automatically created when you initialize or reset the D1 database:

```bash
# Initialize database (safe, preserves existing data)
npm run db:init:confirm

# Or reset database (drops and recreates all tables)
npm run db:reset:confirm
```

**remote_nodes table** includes:
- Node metadata (name, host, port, username)
- Authentication credentials (SSH key or password)
- Working home directory path
- SSH Service API configuration (SSH Service API URL and Key)
- Timestamps (created_at, updated_at)

**app_settings table** includes:
- Key-value pairs for application settings
- LiteLLM configuration (base URL, API key, model name)
- Timestamps (created_at, updated_at)

**Database Schema:**

The database schema is defined in `schema.sql`. The tables use SQLite syntax compatible with Cloudflare D1:

- UUIDs are stored as TEXT (SQLite doesn't have native UUID type)
- Timestamps use ISO 8601 format (TEXT type with `datetime('now')` default)
- Indexes are created on frequently queried fields (host, username, key)

#### Using Remote Nodes

When submitting a patch:
1. Select a remote node from the dropdown (optional)
2. If a remote node is selected, provide a Git repository URL
3. The system will execute git operations on the remote node:
   - Clone the repository with specified target project and branch
   - Apply the patch
   - Perform conflict resolution if needed
   - Commit and push changes

#### Git Clone Operations

The system supports cloning git repositories on remote nodes with the following features:
- **Target Project**: Specify the git repository URL to clone
- **Target Branch**: Clone a specific branch from the repository
- **Working Home Directory**: Uses the configured working home directory from remote node settings
- **Automatic Directory Management**: Auto-generates unique directory names or uses specified target directory
- **Repository Updates**: If the target directory already exists, the system will update the repository instead of cloning

The git clone functionality uses a bash template script that is embedded in the SSH Service API. When SSH Service API is configured for a remote node, the system automatically uses the dedicated `/git-clone` endpoint for optimal performance.

### Gerrit Configuration

Configure environment variables needed to interact with AOSP Gerrit in Cloudflare Workers.

**Option 1: Sync from .env.local (Recommended)**

1. Add Gerrit credentials and cache version to `.env.local`:
   ```bash
   GERRIT_BASE_URL=https://android-review.googlesource.com
   GERRIT_USERNAME=your-gerrit-username
   GERRIT_PASSWORD=your-gerrit-password-or-token
   CACHE_VERSION=v1
   ```

2. Sync to `wrangler.toml`:
   ```bash
   npm run sync:env
   ```

3. Deploy the Worker:
   ```bash
   npm run deploy
   ```

**Note:** The `sync:env` script also syncs `CACHE_VERSION` from `.env.local` to `wrangler.toml`. Update `CACHE_VERSION` (e.g., to `v2`) and redeploy to invalidate all cached responses for projects and branches.

**Option 2: Manual Configuration**

Alternatively, configure Gerrit credentials manually:

```bash
# Gerrit basics (vars in wrangler.toml)
GERRIT_BASE_URL=https://android-review.googlesource.com
MAX_FILE_SIZE=10485760           # 10MB
RATE_LIMIT_WINDOW=900000         # 15 minutes (ms)
RATE_LIMIT_MAX=10                # max requests per window

# Gerrit credentials (store via Wrangler Secrets for production)
# For development, you can use vars in wrangler.toml
# For production, sensitive information should be managed as secrets:
wrangler secret put GERRIT_USERNAME
wrangler secret put GERRIT_PASSWORD
```

**Note:** The `sync:env` script will automatically add `GERRIT_USERNAME` and `GERRIT_PASSWORD` to `wrangler.toml` as vars. For production deployments, consider using Wrangler secrets for better security:

```bash
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
  { binding = "PATCHX_KV", id = "<your_kv_id>" }
]
d1_databases = [
  { binding = "PATCHX_D1", database_name = "patchx-db", database_id = "<your_database_id>" }
]
```

### AI Feature Activation

AI conflict resolution is enabled based on configuration:

1. Auto detection of available providers
2. Multi‑provider mode for comparison
3. Smart selection of the highest‑confidence solution

## 📋 API Documentation

### Authentication API

#### Sign in
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
  "message": "Sign in successful"
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

#### Clone git repository on remote node
```
POST /api/git/clone
```

**Description:** Clone a git repository on a remote node with specified target project and branch.

Request (`application/json`):
```json
{
  "nodeId": "string (required) - Remote node ID",
  "repositoryUrl": "string (required) - Target Project (Git repository URL)",
  "branch": "string (required) - Target Branch to clone",
  "targetDir": "string (optional) - Target directory name, auto-generated if not provided"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "targetDir": "string - Full path to cloned repository",
    "output": "string - Command output"
  },
  "error": "string (if success is false)"
}
```

**Note:** This endpoint uses the remote node configuration (Host, Port, Username, Working Home, SSH API, SSH API Key, SSH password or SSH Private Key) to execute the git clone operation via SSH. The operation uses a bash template script embedded in the SSH Service API for reliable repository cloning.

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

#### Get Gerrit projects list
```
GET /api/projects
```

Query Parameters (optional):
- `prefix` - Filter projects by prefix (case sensitive)
- `substring` - Filter projects by substring (case insensitive)
- `regex` - Filter projects by regex pattern
- `limit` - Limit number of results
- `skip` - Skip number of results
- `all` - Include hidden projects (default: false, **Note:** This option is disabled in most Gerrit instances)
- `state` - Filter by state: ACTIVE, READ_ONLY, or HIDDEN
- `type` - Filter by type: ALL, CODE, or PERMISSIONS
- `description` - Include project descriptions (default: false)

Example:
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

#### Get branches for a project
```
GET /api/projects/:project/branches
```

Path Parameters:
- `project` - The project name (URL encoded, e.g., `platform%2Fframeworks%2Fbase`)

Example:
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

**Note:** Branches are automatically fetched and displayed in the submit page when a project is selected. The branch dropdown is disabled until a project is chosen. Both "Target Project" and "Target Branch" dropdowns support real-time search and filtering to help users quickly find the desired project or branch.

**Caching:**
- **Client-side:** Both projects and branches are cached locally in the browser for 10 minutes to improve performance. Users can manually refresh the cache using the refresh button (🔄) next to the "Target Project" and "Target Branch" dropdowns. The cache persists across page reloads using localStorage.
- **Server-side:** The Worker also caches API responses for 10 minutes to reduce calls to Gerrit. To invalidate all server-side caches on deploy, update `CACHE_VERSION` in `.env.local` (e.g., change from `v1` to `v2`), run `npm run sync:env`, and redeploy.

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
npm run deploy
# This runs: npm run build:worker && npx wrangler deploy

# Or deploy manually
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

### D1 Database Configuration

1. **Create D1 Databases:**
   ```bash
   # Create production database
   wrangler d1 create patchx-db

   # Create staging database (optional)
   wrangler d1 create patchx-db-staging
   ```

2. **Update wrangler.toml:**
   - Copy the `database_id` from the command output
   - Update the `d1_databases` sections in `wrangler.toml` with actual database IDs
   - **Important:** Make sure the `database_id` matches exactly what was created

3. **Verify Database Binding:**
   ```bash
   # List all D1 databases to verify the database exists
   wrangler d1 list

   # Verify the database_id in wrangler.toml matches
   # The output should show your database with the same ID
   ```

4. **Initialize Database:**
   ```bash
   # For local development: Initialize local database
   npm run db:init:confirm

   # For production deployment: Initialize remote production database
   bash scripts/reset-db.sh --init --env production --remote --confirm

   # For staging deployment: Initialize remote staging database
   bash scripts/reset-db.sh --init --env staging --remote --confirm
   ```

5. **Troubleshooting "D1 database binding (PATCHX_D1) is not configured" error:**

   If you see this error in production, check:

   a. **Verify database exists:**
      ```bash
      wrangler d1 list
      ```
      Make sure `patchx-db` exists and note its `database_id`

   b. **Verify wrangler.toml configuration:**
      - Check that `[env.production]` section has `d1_databases` configured
      - Verify the `database_id` matches the one from `wrangler d1 list`
      - Ensure the `binding` is set to `"PATCHX_D1"` (case-sensitive)

   c. **Redeploy after fixing configuration:**
      ```bash
      npm run deploy
      ```

   d. **Verify binding in Cloudflare Dashboard:**
      - Go to Cloudflare Dashboard → Workers & Pages → Your Worker
      - Check Settings → Variables → D1 Database Bindings
      - Ensure `PATCHX_D1` binding is configured and points to the correct database

   e. **If database doesn't exist, create it:**
      ```bash
      wrangler d1 create patchx-db
      # Copy the database_id from output
      # Update wrangler.toml with the new database_id
      # Redeploy: npm run deploy
      ```

### Environment Variables Sync

Sync environment variables from `.env.local` to `wrangler.toml`:

**Steps:**
1. Ensure your `.env.local` has the required variables (see `.env.example`):
   - `VITE_PUBLIC_SITE_URL`
   - `GERRIT_BASE_URL`, `GERRIT_USERNAME`, `GERRIT_PASSWORD`
   - `RESEND_API_KEY` (optional, for email)
   - `ADMIN_USER_PASSWORD`, `TEST_USER_PASSWORD`
   - `CACHE_VERSION` (defaults to `v1`)
2. Sync them to `wrangler.toml`:
   ```bash
   npm run sync:env
   ```
3. Deploy the Worker:
   ```bash
   npm run deploy
   ```

**Note:** To invalidate server-side caches on deploy, update `CACHE_VERSION` in `.env.local` (e.g., change to `v2`), run `npm run sync:env`, and redeploy.

### Cloudflare Pages Environment Variables (Optional)

You can also set environment variables in Cloudflare Pages dashboard:

1. Go to your Cloudflare Pages project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables for **Production** (and **Preview** if needed):
   - `VITE_PUBLIC_SITE_URL` - Public URL of your site (e.g., `https://patchx.pages.dev`)

**Important:** D1 database is configured via `wrangler.toml` and bound to the Worker. No database connection strings or credentials are needed in environment variables.

### Post‑deployment URLs
- Frontend (Cloudflare Pages): `https://patchx.pages.dev`
- Backend API (Cloudflare Workers): `https://patchx-service.angersax.workers.dev`

### Automatic redirects
The frontend uses a `_redirects` file to forward `/api/*` requests to the backend Workers. No frontend code changes are required.

## 📄 License

Apache-2.0

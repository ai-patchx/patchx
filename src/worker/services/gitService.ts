import { Env } from '../types'
import { getKvNamespace, KVLike } from '../kv'
import { getD1Database, queryD1First } from '../d1'

interface RemoteNodeData {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
  sshKey?: string
  password?: string
  workingHome?: string // Working directory path on the remote node
  sshServiceApiUrl?: string // SSH service API URL for command execution
  sshServiceApiKey?: string // SSH service API key for authentication
  createdAt: string
  updatedAt: string
}

interface GitCommandResult {
  success: boolean
  output: string
  error?: string
  commandId?: string
}

export class GitService {
  private env: Env
  private kv: KVLike

  constructor(env: Env) {
    this.env = env
    this.kv = getKvNamespace(env)
  }

  /**
   * Get remote node data from D1
   */
  private async getRemoteNode(nodeId: string): Promise<RemoteNodeData | null> {
    try {
      const db = getD1Database(this.env)

      // Add timeout to D1 query (3 seconds - shorter timeout to fail fast)
      const QUERY_TIMEOUT_MS = 3000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let queryResolved = false

      // Wrap D1 query in a Promise for proper timeout handling
      const nodeQueryPromise = queryD1First<{
        id: string
        name: string
        host: string
        port: number
        username: string
        auth_type: string
        ssh_key: string | null
        password: string | null
        working_home: string | null
        ssh_service_api_url: string | null
        ssh_service_api_key: string | null
        created_at: string
        updated_at: string
      }>(
        db,
        'SELECT * FROM remote_nodes WHERE id = ?',
        [nodeId]
      ).then((node) => {
        if (!queryResolved) {
          queryResolved = true
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          return node
        }
        return null
      }).catch((error) => {
        if (!queryResolved) {
          queryResolved = true
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          throw error
        }
        return null
      })

      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          if (!queryResolved) {
            queryResolved = true
            resolve(null)
          }
        }, QUERY_TIMEOUT_MS)
      })

      const node = await Promise.race([nodeQueryPromise, timeoutPromise])

      // Clean up timeout if query resolved first
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      if (!node) {
        const errorMsg = 'Node not found or query timeout'
        console.error(`[GitService] Failed to get remote node ${nodeId}:`, errorMsg)
        return null
      }

      // Map D1 data to RemoteNodeData format
      const nodeData: RemoteNodeData = {
        id: node.id,
        name: node.name,
        host: node.host,
        port: node.port,
        username: node.username,
        authType: node.auth_type as 'key' | 'password',
        sshKey: node.ssh_key || undefined,
        password: node.password || undefined,
        workingHome: node.working_home || undefined,
        sshServiceApiUrl: node.ssh_service_api_url || undefined,
        sshServiceApiKey: node.ssh_service_api_key || undefined,
        createdAt: node.created_at,
        updatedAt: node.updated_at
      }

      return nodeData
    } catch (error) {
      console.error(`[GitService] Error getting remote node ${nodeId}:`, error)
      return null
    }
  }

  /**
   * Execute a git command on a remote node via SSH
   * Note: This is a placeholder implementation. In production, you would need:
   * 1. A separate Node.js service that handles SSH connections, OR
   * 2. Use a library that works in Cloudflare Workers (if available), OR
   * 3. Use an external SSH service API
   */
  private async executeSSHCommand(
    node: RemoteNodeData,
    command: string,
    workingDir?: string
  ): Promise<GitCommandResult> {
    // TODO: Implement actual SSH command execution
    // Since Cloudflare Workers don't support SSH natively, you have several options:
    // 1. Use a separate Node.js service that handles SSH and expose it via HTTP API
    // 2. Use a library like 'ssh2' in a separate service
    // 3. Use an external SSH service

    // For now, this is a placeholder that shows the structure
    // In production, replace this with actual SSH execution

    const fullCommand = workingDir ? `cd ${workingDir} && ${command}` : command

    // Use SSH service API if configured
    if (node.sshServiceApiUrl) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker/1.0'
        }
        if (node.sshServiceApiKey) {
          headers['Authorization'] = `Bearer ${node.sshServiceApiKey}`
        }

        // Set timeout (default 5 minutes, configurable via environment or node config)
        const timeout = 300000 // 5 minutes in milliseconds
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          const response = await fetch(`${node.sshServiceApiUrl}/execute`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              host: node.host,
              port: node.port,
              username: node.username,
              authType: node.authType,
              sshKey: node.sshKey,
              password: node.password,
              command: fullCommand,
              timeout // Pass timeout to ssh-service-api
            }),
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            // Normalize the SSH Service API URL for error messages
            let baseUrl = node.sshServiceApiUrl.trim()
            baseUrl = baseUrl.replace(/\/+$/, '') // Remove trailing slashes
            const executeUrl = `${baseUrl}/execute`

            let errorData: { error?: string; commandId?: string } = { error: 'Failed to execute SSH command' }
            try {
              errorData = await response.json() as { error?: string; commandId?: string }
            } catch {
              // If JSON parsing fails, try to get text and clean HTML if present
              try {
                const errorText = await response.text()
                if (errorText) {
                  // Check if response is HTML (common for nginx/404 errors)
                  if (errorText.trim().startsWith('<') || errorText.includes('<html>') || errorText.includes('<!DOCTYPE')) {
                    // Extract meaningful error from HTML
                    const titleMatch = errorText.match(/<title[^>]*>([^<]+)<\/title>/i)
                    const h1Match = errorText.match(/<h1[^>]*>([^<]+)<\/h1>/i)
                    if (titleMatch) {
                      errorData.error = titleMatch[1].trim()
                    } else if (h1Match) {
                      errorData.error = h1Match[1].trim()
                    } else {
                      errorData.error = `HTTP ${response.status}: ${response.statusText}`
                    }
                  } else {
                    errorData.error = errorText
                  }
                }
              } catch {
                // Use default error message
              }
            }

            // Provide more helpful error messages for common HTTP status codes
            let finalError = errorData.error || 'Unknown error'
            if (response.status === 404) {
              // Check if this is an nginx 404 (HTML response) or backend 404 (JSON response)
              const errorText = errorData.error || ''
              const isNginx404 = errorText.includes('nginx') || errorText.includes('404 Not Found') || errorText.includes('<html>')
              const urlObj = new URL(executeUrl)
              const baseUrlOnly = urlObj.origin

              if (isNginx404) {
                finalError = `Endpoint not found (404): The nginx reverse proxy returned 404 for "${executeUrl}". This usually means: 1) The endpoint path is incorrect, 2) Nginx routing is misconfigured, or 3) The backend service is not running. Check: ${baseUrlOnly}/api/ssh/health`
              } else {
                finalError = `Endpoint not found (404): "${executeUrl}" was not found. Base URL: ${baseUrlOnly}. Check service health at ${baseUrlOnly}/api/ssh/health and verify nginx reverse proxy configuration.`
              }
            } else if (response.status === 401) {
              finalError = `Authentication failed (401). Please check that your SSH Service API Key is correct.`
            } else if (response.status === 403) {
              finalError = `Access forbidden (403). Please verify your SSH Service API URL and API Key configuration.`
            }

            const isTimeout = response.status === 408 || (errorData.error && errorData.error.includes('timed out'))
            return {
              success: false,
              output: '',
              error: finalError,
              commandId: errorData.commandId
            }
          }

          const result = await response.json() as {
            success: boolean
            output?: string
            stdout?: string
            stderr?: string
            combined?: string
            error?: string
            exitCode?: number
            commandId?: string
          }
          // Use combined output if available (includes both stdout and stderr), otherwise fall back to output
          const fullOutput = result.combined || result.stdout || result.output || ''
          const errorOutput = result.stderr || result.error || ''
          return {
            success: result.success,
            output: fullOutput,
            error: result.success ? undefined : (errorOutput || result.error),
            commandId: result.commandId
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return {
              success: false,
              output: '',
              error: `SSH command execution timed out after ${timeout}ms`
            }
          }
          throw fetchError
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to execute SSH command via service: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }

    throw new Error(
      'SSH execution not implemented. Please configure SSH Service API URL in the remote node settings or set up an SSH service.'
    )
  }

  /**
   * Clone a git repository on a remote node
   * Uses bash template logic to handle repository cloning with proper error handling
   *
   * @param nodeId - Remote node ID
   * @param repositoryUrl - Target Project (Git repository URL)
   * @param branch - Target Branch to clone
   * @param targetDir - Optional target directory name (auto-generated if not provided)
   * @returns GitCommandResult with success status, output, and optional error
   */
  async cloneRepository(
    nodeId: string,
    repositoryUrl: string,
    branch: string,
    targetDir?: string,
    onLog?: (message: string) => Promise<void>
  ): Promise<GitCommandResult & { targetDir?: string }> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    // Validate required parameters
    if (!repositoryUrl || !branch) {
      return {
        success: false,
        output: '',
        error: 'Repository URL and branch are required'
      }
    }

    // Use working home directory from node configuration, or default to ~/git-work
    // Note: The script template will expand ~ to $HOME on the remote node
    const workingHome = node.workingHome || '~/git-work'

    // Extract project name from repository URL
    // Format: https://android-review.googlesource.com/platform/frameworks/base
    // Extract the project part after the base URL
    let projectName = repositoryUrl
    if (this.env.GERRIT_BASE_URL) {
      const baseUrl = this.env.GERRIT_BASE_URL.replace(/\/$/, '')
      if (repositoryUrl.startsWith(baseUrl + '/')) {
        projectName = repositoryUrl.substring(baseUrl.length + 1)
      }
    }

    // Try to use dedicated git-clone endpoint if SSH service API is configured
    if (node.sshServiceApiUrl) {
      try {
        // Normalize the SSH Service API URL
        // Remove trailing slashes and ensure proper formatting
        let baseUrl = node.sshServiceApiUrl.trim()
        baseUrl = baseUrl.replace(/\/+$/, '') // Remove trailing slashes

        // Construct the request URL
        // Ensure the URL ends with /api/ssh (matching test script behavior)
        // The test script shows: https://supagraph.ai/api/ssh/git-clone
        if (!baseUrl.endsWith('/api/ssh')) {
          // If baseUrl doesn't end with /api/ssh, ensure it does
          if (baseUrl.includes('/api/ssh')) {
            // Remove everything after /api/ssh
            const apiSshIndex = baseUrl.indexOf('/api/ssh')
            baseUrl = baseUrl.substring(0, apiSshIndex + '/api/ssh'.length)
          } else {
            // Append /api/ssh if not present
            baseUrl = `${baseUrl}/api/ssh`
          }
        }

        // Construct the full request URL (should be: https://supagraph.ai/api/ssh/git-clone)
        const requestUrl = `${baseUrl}/git-clone`

        // Validate URL format
        try {
          const urlObj = new URL(requestUrl)
          if (!urlObj.pathname.startsWith('/api/ssh/')) {
            console.warn(`[Git Clone] Warning: Request URL pathname "${urlObj.pathname}" doesn't start with "/api/ssh/"`)
          }
        } catch (urlError) {
          console.error(`[Git Clone] Invalid URL constructed: ${requestUrl}`, urlError)
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker/1.0'
        }
        if (node.sshServiceApiKey) {
          headers['Authorization'] = `Bearer ${node.sshServiceApiKey}`
        }
        const requestBody = {
          host: node.host,
          port: node.port,
          username: node.username,
          authType: node.authType,
          sshKey: node.sshKey,
          password: node.password,
          project: projectName,
          gerritBaseUrl: this.env.GERRIT_BASE_URL,
          branch,
          workingHome,
          targetDir
        }

        // Add timeout (5 minutes for git clone)
        const timeout = 300000 // 5 minutes
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.error(`[Git Clone] Timeout reached after ${timeout}ms, aborting request`)
          controller.abort()
        }, timeout)

        let response: Response
        const fetchStartTime = Date.now()
        try {
          response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          const fetchDuration = Date.now() - fetchStartTime
        } catch (fetchError) {
          clearTimeout(timeoutId)
          const fetchDuration = Date.now() - fetchStartTime
          console.error(`[Git Clone] Fetch failed after ${fetchDuration}ms:`, fetchError)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const errorMsg = `Git clone request timed out after ${timeout}ms (actual duration: ${fetchDuration}ms)`
            console.error(`[Git Clone] ${errorMsg}`)
            return {
              success: false,
              output: '',
              error: errorMsg,
              targetDir: undefined
            }
          }
          const errorMsg = `Failed to fetch git clone endpoint after ${fetchDuration}ms: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
          console.error(`[Git Clone] ${errorMsg}`)
          return {
            success: false,
            output: '',
            error: errorMsg,
            targetDir: undefined
          }
        }

        const responseStartTime = Date.now()

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Failed to read error response')
          const errorReadTime = Date.now() - responseStartTime

          let errorData: { error?: string; success?: boolean } = { error: 'Failed to execute git clone' }
          try {
            errorData = JSON.parse(errorText)
            // Check if this is the nginx default location 404 (returns JSON)
            if (errorData.error && errorData.error.includes('Endpoint not found') && errorData.error.includes('/api/ssh/*')) {
            }
          } catch {
            // If JSON parsing fails, check if response is HTML and extract clean error
            let cleanError = errorText || `HTTP ${response.status}: ${response.statusText}`
            if (errorText && (errorText.trim().startsWith('<') || errorText.includes('<html>') || errorText.includes('<!DOCTYPE'))) {
              // Extract meaningful error from HTML (e.g., title tag or h1)
              const titleMatch = errorText.match(/<title[^>]*>([^<]+)<\/title>/i)
              const h1Match = errorText.match(/<h1[^>]*>([^<]+)<\/h1>/i)
              if (titleMatch) {
                cleanError = titleMatch[1].trim()
              } else if (h1Match) {
                cleanError = h1Match[1].trim()
              } else {
                cleanError = `HTTP ${response.status}: ${response.statusText}`
              }
            } else if (errorText.length > 0) {
              // Not HTML, use the text as-is (might be plain text error)
              cleanError = errorText.substring(0, 500) // Limit length
            }
            errorData = { error: cleanError }
          }

          // Provide more helpful error messages for common HTTP status codes
          let finalError = errorData.error || `HTTP ${response.status}: ${response.statusText}`
          if (response.status === 404) {
            // Check if this is an nginx 404 (HTML response) or backend 404 (JSON response)
            const isNginx404 = errorText.includes('nginx') || errorText.includes('404 Not Found') || errorText.includes('<html>') || errorText.includes('<!DOCTYPE')
            const isNginxDefault404 = errorData.error && errorData.error.includes('Endpoint not found') && errorData.error.includes('/api/ssh/*')
            const urlObj = new URL(requestUrl)
            const baseUrlOnly = urlObj.origin

            if (isNginxDefault404) {
              // This is the nginx default location block returning 404 JSON
              // This means the request didn't match /api/ssh/ location block
              finalError = `Endpoint not found (404): Request to "${requestUrl}" did not match nginx location blocks and hit the default handler. This suggests: 1) The URL path might be incorrect, 2) Nginx location matching failed (check if trailing slash matters), 3) Request headers might be causing routing issues. Direct tests work, so this is likely a Cloudflare Worker request format issue. Try: ${baseUrlOnly}/api/ssh/health to verify nginx is accessible.`
            } else if (isNginx404) {
              finalError = `Endpoint not found (404): The nginx reverse proxy returned 404 for "${requestUrl}". This usually means: 1) The endpoint path is incorrect, 2) Nginx routing is misconfigured, or 3) The backend service is not running. Check: ${baseUrlOnly}/api/ssh/health. Note: Direct tests from the server work (see ssh.log), so this may be a Cloudflare Worker-specific routing issue.`
            } else {
              finalError = `Endpoint not found (404): "${requestUrl}" was not found. Base URL: ${baseUrlOnly}. Check service health at ${baseUrlOnly}/api/ssh/health and verify nginx reverse proxy configuration.`
            }
          } else if (response.status === 401) {
            finalError = `Authentication failed (401). Please check that your SSH Service API Key is correct and matches the API_KEY configured on the SSH service.`
          } else if (response.status === 403) {
            finalError = `Access forbidden (403). This may indicate: 1) The API key is incorrect or missing, 2) A reverse proxy or firewall is blocking the request, 3) The SSH service API URL is incorrect.`
          } else if (response.status >= 500) {
            finalError = `Server error (${response.status}): ${finalError}. The SSH service API may be experiencing issues.`
          }

          console.error(`[Git Clone] Failed with status ${response.status}: ${finalError}`)
          // Only log full error response in debug mode (truncate HTML to avoid log spam)
          if (errorText && errorText.length < 200 && !errorText.includes('<html>')) {
            console.error(`[Git Clone] Error response: ${errorText}`)
          } else {
            console.error(`[Git Clone] Error response (HTML or too long, ${errorText.length} chars)`)
          }
          return {
            success: false,
            output: '',
            error: finalError,
            targetDir: undefined
          }
        }

        let result: {
          success: boolean
          output?: string
          stdout?: string
          stderr?: string
          combined?: string
          error?: string
          exitCode?: number
        }

        try {
          const jsonText = await response.text()
          const jsonParseTime = Date.now() - responseStartTime
          result = JSON.parse(jsonText) as typeof result
        } catch (parseError) {
          const parseDuration = Date.now() - responseStartTime
          return {
            success: false,
            output: '',
            error: `Failed to parse response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            targetDir: undefined
          }
        }

        // Use combined output if available (includes both stdout and stderr), otherwise fall back to output
        const fullOutput = result.combined || result.stdout || result.output || ''
        const errorOutput = result.stderr || result.error || ''

        // Extract target directory from output if available
        const targetDirMatch = fullOutput.match(/TARGET_DIR=([^\n]+)/)
        const extractedTargetDir = targetDirMatch ? targetDirMatch[1] : undefined

        return {
          success: result.success,
          output: fullOutput,
          error: result.success ? undefined : (errorOutput || result.error),
          targetDir: extractedTargetDir
        }
      } catch (error) {
        // Fall through to inline execution if endpoint is not available
        console.warn(`[Git Clone] Failed to use git-clone endpoint, falling back to inline execution: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Fallback to inline execution (original method)
    // Generate target directory name from project name if not provided
    let finalTargetDir = targetDir
    if (!finalTargetDir) {
      // Extract repository name from project path
      // Handle formats: platform/frameworks/base -> base
      const repoName = projectName.split('/').pop() || 'repository'
      const sanitizedBranch = branch.replace(/[^a-zA-Z0-9_-]/g, '_')
      const timestamp = Date.now()
      finalTargetDir = `${repoName}_${sanitizedBranch}_${timestamp}`
    }

    const fullTargetDir = `${workingHome}/${finalTargetDir}`
    const gerritBaseUrl = this.env.GERRIT_BASE_URL || ''

    // Build bash script based on template logic
    // This implements the git-clone-template.sh logic inline
    const bashScript = `
set -e
set -u

WORKING_HOME="${workingHome}"
TARGET_PROJECT="${projectName.replace(/"/g, '\\"')}"
TARGET_BRANCH="${branch.replace(/"/g, '\\"')}"
GERRIT_BASE_URL="${gerritBaseUrl.replace(/"/g, '\\"')}"
TARGET_DIR="${finalTargetDir.replace(/"/g, '\\"')}"
FULL_TARGET_DIR="${fullTargetDir.replace(/"/g, '\\"')}"

# Validate required parameters
if [ -z "$TARGET_PROJECT" ]; then
    echo "[ERROR] TARGET_PROJECT (project name) is required" >&2
    exit 1
fi

if [ -z "$TARGET_BRANCH" ]; then
    echo "[ERROR] TARGET_BRANCH is required" >&2
    exit 1
fi

if [ -z "$GERRIT_BASE_URL" ]; then
    echo "[ERROR] GERRIT_BASE_URL is required" >&2
    exit 1
fi

# Construct repository URL from GERRIT_BASE_URL and project name
GERRIT_BASE_URL="\${GERRIT_BASE_URL%/}"
REPOSITORY_URL="$GERRIT_BASE_URL/$TARGET_PROJECT"

# Log functions for console output
log_info() {
    echo "[INFO] $1"
}

log_success() {
    echo "[SUCCESS] $1"
}

log_warn() {
    echo "[WARN] $1" >&2
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_info "Starting git clone operation"
log_info "Repository URL: $REPOSITORY_URL"
log_info "Project: $TARGET_PROJECT"
log_info "Branch: $TARGET_BRANCH"
log_info "Working Home: $WORKING_HOME"

# Create working home directory if it doesn't exist
mkdir -p "$WORKING_HOME" || { log_error "Failed to create working home directory: $WORKING_HOME"; exit 1; }

# Check if target directory already exists
if [ -d "$FULL_TARGET_DIR" ]; then
  log_warn "Target directory already exists: $FULL_TARGET_DIR"
  # Try to update existing repository instead
  log_info "Updating existing repository in: $FULL_TARGET_DIR"
  cd "$FULL_TARGET_DIR" || { log_error "Failed to change to directory: $FULL_TARGET_DIR"; exit 1; }

  # Check if it's a git repository
  if [ -d .git ]; then
    log_info "Fetching latest changes..."
    git fetch origin || log_warn "Failed to fetch from origin"
    log_info "Checking out branch: $TARGET_BRANCH"
    git checkout "$TARGET_BRANCH" || log_warn "Failed to checkout branch: $TARGET_BRANCH"
    log_info "Pulling latest changes..."
    git pull origin "$TARGET_BRANCH" || log_warn "Failed to pull latest changes"
    log_success "Repository updated successfully in: $FULL_TARGET_DIR"
    echo "TARGET_DIR=$FULL_TARGET_DIR"
    exit 0
  else
    log_error "Directory exists but is not a git repository: $FULL_TARGET_DIR"
    exit 1
  fi
fi

# Clone the repository
log_info "Cloning repository: $REPOSITORY_URL"
log_info "Project: $TARGET_PROJECT"
log_info "Branch: $TARGET_BRANCH"
log_info "Target directory: $FULL_TARGET_DIR"

cd "$WORKING_HOME" || { log_error "Failed to change to working home directory: $WORKING_HOME"; exit 1; }

# Clone with branch specification
log_info "Executing git clone command..."
if git clone -b "$TARGET_BRANCH" --depth 1 "$REPOSITORY_URL" "$TARGET_DIR"; then
  log_success "Repository cloned successfully to: $FULL_TARGET_DIR"

  # Verify the clone
  cd "$FULL_TARGET_DIR" || { log_error "Failed to change to cloned directory"; exit 1; }

  # Check current branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log_info "Current branch: $CURRENT_BRANCH"

  # Show repository status
  log_info "Repository status:"
  git status --short || true

  # Output the target directory path for use by calling script
  echo "TARGET_DIR=$FULL_TARGET_DIR"
  exit 0
else
  log_error "Failed to clone repository: $REPOSITORY_URL"
  exit 1
fi
`.trim()

    // Execute the bash script
    const result = await this.executeSSHCommand(node, bashScript)

    // Extract target directory from output if available
    const targetDirMatch = result.output.match(/TARGET_DIR=([^\n]+)/)
    const extractedTargetDir = targetDirMatch ? targetDirMatch[1] : fullTargetDir

    return {
      ...result,
      targetDir: extractedTargetDir
    }
  }

  /**
   * Apply a patch file on a remote node
   */
  async applyPatch(
    nodeId: string,
    patchContent: string,
    repositoryPath: string,
    options?: {
      check?: boolean
      reverse?: boolean
      directory?: string
    }
  ): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    // Write patch content to a temporary file on the remote node
    const patchFileName = `/tmp/patch_${Date.now()}.patch`
    const writePatchCommand = `cat > ${patchFileName} << 'PATCH_EOF'\n${patchContent}\nPATCH_EOF`
    const writeResult = await this.executeSSHCommand(node, writePatchCommand, repositoryPath)
    if (!writeResult.success) {
      return writeResult
    }

    // Build git apply command with verbose output
    let applyCommand = 'git apply --verbose'
    if (options?.check) {
      applyCommand += ' --check'
    }
    if (options?.reverse) {
      applyCommand += ' --reverse'
    }
    if (options?.directory) {
      applyCommand += ` --directory=${options.directory}`
    }
    applyCommand += ` ${patchFileName} 2>&1` // Redirect stderr to stdout to capture all output

    const applyResult = await this.executeSSHCommand(node, applyCommand, repositoryPath)

    // Clean up patch file
    const cleanupCommand = `rm -f ${patchFileName}`
    await this.executeSSHCommand(node, cleanupCommand, repositoryPath)

    return applyResult
  }

  /**
   * Checkout a branch on a remote node
   */
  async checkoutBranch(
    nodeId: string,
    repositoryPath: string,
    branch: string,
    createIfNotExists: boolean = false
  ): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    const checkoutCommand = createIfNotExists
      ? `git checkout -b ${branch} 2>&1`
      : `git checkout ${branch} 2>&1`

    return await this.executeSSHCommand(node, checkoutCommand, repositoryPath)
  }

  /**
   * Get current branch on a remote node
   */
  async getCurrentBranch(nodeId: string, repositoryPath: string): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    const command = 'git rev-parse --abbrev-ref HEAD'
    return await this.executeSSHCommand(node, command, repositoryPath)
  }

  /**
   * Get git status on a remote node
   */
  async getStatus(nodeId: string, repositoryPath: string): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    const command = 'git status --porcelain'
    return await this.executeSSHCommand(node, command, repositoryPath)
  }

  /**
   * Pull latest changes from remote on a remote node
   */
  async pull(nodeId: string, repositoryPath: string, branch?: string): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    const command = branch ? `git pull origin ${branch}` : 'git pull'
    return await this.executeSSHCommand(node, command, repositoryPath)
  }

  /**
   * Execute a full workflow: clone, checkout branch, apply patch
   * Uses working home directory from remote node configuration
   *
   * @param onLog - Optional callback to log messages during execution
   */
  async executeGitWorkflow(
    nodeId: string,
    repositoryUrl: string,
    branch: string,
    patchContent: string,
    workDir?: string,
    onLog?: (message: string) => Promise<void>
  ): Promise<{
    success: boolean
    results: {
      clone?: GitCommandResult & { targetDir?: string }
      checkout?: GitCommandResult
      apply?: GitCommandResult
      status?: GitCommandResult
    }
    error?: string
    targetDir?: string
  }> {
    const results: {
      clone?: GitCommandResult & { targetDir?: string }
      checkout?: GitCommandResult
      apply?: GitCommandResult
      status?: GitCommandResult
    } = {}

    try {
      console.log(`[Git Workflow] Starting git workflow for repository: ${repositoryUrl}`)
      console.log(`[Git Workflow] Branch: ${branch}`)
      console.log(`[Git Workflow] Node ID: ${nodeId}`)

      // Get node to access working home directory
      let node
      try {
        if (onLog) await onLog(`[Info] Retrieving remote node configuration for node ID: ${nodeId}`)
        node = await this.getRemoteNode(nodeId)
        if (!node) {
          const errorMsg = `Remote node ${nodeId} not found in storage`
          console.error(`[Git Workflow] ${errorMsg}`)
          if (onLog) await onLog(`[Error] ${errorMsg}`)
          return {
            success: false,
            results,
            error: errorMsg
          }
        }

        // Verify node has required configuration
        if (onLog) {
          await onLog(`[Info] Remote node found: ${node.name || nodeId}`)
          await onLog(`[Info] Node host: ${node.host}:${node.port || 22}`)
          await onLog(`[Info] Working Home: ${node.workingHome || '~/git-work (default)'}`)
          await onLog(`[Info] SSH Service API URL: ${node.sshServiceApiUrl || 'NOT CONFIGURED'}`)
        }

        if (!node.sshServiceApiUrl) {
          const errorMsg = `Remote node ${nodeId} does not have SSH Service API URL configured`
          console.error(`[Git Workflow] ${errorMsg}`)
          if (onLog) await onLog(`[Error] ${errorMsg}`)
          if (onLog) await onLog(`[Error] Please configure sshServiceApiUrl for this remote node`)
          return {
            success: false,
            results,
            error: errorMsg
          }
        }
      } catch (nodeError) {
        const errorMsg = `Failed to get remote node ${nodeId}: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`
        console.error(`[Git Workflow] ${errorMsg}`, nodeError)
        if (onLog) await onLog(`[Error] ${errorMsg}`)
        return {
          success: false,
          results,
          error: errorMsg
        }
      }

      // Step 1: Clone repository (will use working home from node config)
      if (onLog) await onLog('[Info] Executing git clone command...')
      if (onLog) await onLog('[Info] This may take several minutes depending on repository size...')
      if (onLog) await onLog(`[Info] Repository URL: ${repositoryUrl}`)
      if (onLog) await onLog(`[Info] Branch: ${branch}`)
      console.log(`[Git Workflow] Step 1: Cloning repository...`)
      console.log(`[Git Workflow] Repository: ${repositoryUrl}, Branch: ${branch}`)

      const cloneStartTime = Date.now()
      if (onLog) await onLog('[Info] Calling cloneRepository function...')
      const cloneResult = await this.cloneRepository(nodeId, repositoryUrl, branch, workDir, onLog)
      const cloneDuration = Date.now() - cloneStartTime
      console.log(`[Git Workflow] Clone completed in ${cloneDuration}ms`)
      if (onLog) await onLog(`[Info] Clone result - success: ${cloneResult.success}, has output: ${!!cloneResult.output}`)

      results.clone = cloneResult

      // Log clone output immediately if available
      if (onLog) {
        console.log(`[Git Workflow] Clone result - success: ${cloneResult.success}, has output: ${!!cloneResult.output}, output length: ${cloneResult.output?.length || 0}`)
        if (cloneResult.output) {
          // Remove ANSI color codes if present (from the script's color output)
          const cleanOutput = cloneResult.output.replace(/\x1b\[[0-9;]*m/g, '')
          const lines = cleanOutput.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('TARGET_DIR='))
          console.log(`[Git Workflow] Parsed ${lines.length} lines from clone output`)
          if (lines.length > 0) {
            for (const line of lines) {
              await onLog(line.trim())
            }
          } else {
            await onLog('[Warning] Git clone command executed but produced no parseable output')
            // Only show debug output if it's not HTML (to avoid log spam)
            if (!cloneResult.output.includes('<html>') && cloneResult.output.length < 500) {
              await onLog(`[Debug] Raw output (first 200 chars): ${cloneResult.output.substring(0, 200)}`)
            }
          }
        } else if (!cloneResult.success) {
          // Only log warning if there's no error message (error will be logged below)
          if (!cloneResult.error) {
            await onLog('[Warning] Git clone command executed but no output was captured')
          }
        }
      }

      if (!cloneResult.success) {
        if (onLog) {
          // Error message is already clean (HTML removed in cloneRepository), so log it directly
          const errorMsg = cloneResult.error || 'Unknown error'
          // Split long error messages into multiple log entries for better readability
          if (errorMsg.includes('\n\n')) {
            const parts = errorMsg.split('\n\n')
            await onLog(`[Error] Git clone failed: ${parts[0]}`)
            if (parts.length > 1) {
              // Log troubleshooting steps separately
              const troubleshooting = parts.slice(1).join('\n\n')
              const lines = troubleshooting.split('\n').filter(l => l.trim())
              for (const line of lines) {
                await onLog(`[Error] ${line.trim()}`)
              }
            }
          } else {
            await onLog(`[Error] Git clone failed: ${errorMsg}`)
          }
        }
        console.error(`[Git Workflow] Clone failed: ${cloneResult.error}`)
        return {
          success: false,
          results,
          error: `Failed to clone repository: ${cloneResult.error || 'Unknown error'}`
        }
      }
      if (onLog) await onLog('[Success] Git clone completed successfully')
      console.log(`[Git Workflow] Step 1: Clone completed successfully`)

      // Use the target directory from clone result
      const actualWorkDir = cloneResult.targetDir || workDir || '/tmp/git-work'
      console.log(`[Git Workflow] Working directory: ${actualWorkDir}`)

      // Step 2: Checkout branch (if needed) - clone already checks out the branch, but verify
      if (onLog) await onLog(`[Info] Checking out branch: ${branch}...`)
      console.log(`[Git Workflow] Step 2: Checking out branch: ${branch}...`)
      const checkoutResult = await this.checkoutBranch(nodeId, actualWorkDir, branch)
      results.checkout = checkoutResult

      // Log checkout output immediately
      if (onLog) {
        if (checkoutResult.output) {
          const lines = checkoutResult.output.split(/\r?\n/).filter(l => l.trim())
          if (lines.length > 0) {
            for (const line of lines) {
              await onLog(`[Git Checkout] ${line}`)
            }
          }
        }
      }

      if (!checkoutResult.success) {
        // Non-fatal: branch might already be checked out
        if (onLog) await onLog(`[Warning] Branch checkout: ${checkoutResult.error || 'Unknown warning'}`)
        console.warn(`[Git Workflow] Checkout warning: ${checkoutResult.error}`)
      } else {
        if (onLog) await onLog('[Success] Branch checkout completed')
        console.log(`[Git Workflow] Step 2: Branch checkout completed`)
      }

      // Step 3: Apply patch
      if (onLog) await onLog('[Info] Applying patch to repository...')
      console.log(`[Git Workflow] Step 3: Applying patch...`)
      const applyResult = await this.applyPatch(nodeId, patchContent, actualWorkDir, { check: false })
      results.apply = applyResult

      // Log patch apply output immediately
      if (onLog) {
        if (applyResult.output) {
          const lines = applyResult.output.split(/\r?\n/).filter(l => l.trim())
          if (lines.length > 0) {
            for (const line of lines) {
              await onLog(`[Patch Apply] ${line}`)
            }
          } else {
            await onLog('[Info] Patch apply command executed (no output)')
          }
        } else {
          await onLog('[Info] Patch apply command executed (no output captured)')
        }
        if (applyResult.error) {
          const lines = applyResult.error.split(/\r?\n/).filter(l => l.trim())
          for (const line of lines) {
            await onLog(`[Patch Apply Error] ${line}`)
          }
        }
      }

      if (!applyResult.success) {
        if (onLog) {
          await onLog(`[Error] Patch apply failed: ${applyResult.error || 'Unknown error'}`)
          if (applyResult.error && applyResult.error !== applyResult.output) {
            await onLog(`[Error Details] ${applyResult.error}`)
          }
        }
        console.error(`[Git Workflow] Patch apply failed: ${applyResult.error}`)
        return {
          success: false,
          results,
          error: `Failed to apply patch: ${applyResult.error}`
        }
      }
      if (onLog) await onLog('[Success] Patch applied successfully')
      console.log(`[Git Workflow] Step 3: Patch applied successfully`)

      // Step 4: Get status
      if (onLog) await onLog('[Info] Getting repository status...')
      console.log(`[Git Workflow] Step 4: Getting repository status...`)
      const statusResult = await this.getStatus(nodeId, actualWorkDir)
      results.status = statusResult

      // Log status output immediately
      if (onLog && statusResult.output) {
        await onLog('[Info] Repository status:')
        const lines = statusResult.output.split(/\r?\n/).filter(l => l.trim())
        for (const line of lines) {
          await onLog(`[Git Status] ${line}`)
        }
      }

      if (statusResult.output) {
        console.log(`[Git Workflow] Repository status:\n${statusResult.output}`)
      }

      console.log(`[Git Workflow] All steps completed successfully!`)
      return {
        success: true,
        results,
        targetDir: actualWorkDir
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      console.error(`[Git Workflow] Error during execution: ${errorMsg}`, errorStack)
      if (onLog) {
        await onLog(`[Error] Git workflow error: ${errorMsg}`)
        if (errorStack) {
          await onLog(`[Error] Stack trace: ${errorStack.substring(0, 500)}`) // Limit stack trace length
        }
      }
      return {
        success: false,
        results,
        error: errorMsg
      }
    }
  }
}


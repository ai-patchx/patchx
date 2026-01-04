import { Env } from '../types'
import { getKvNamespace, KVLike } from '../kv'
import { getSupabaseClient } from '../supabase'

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
   * Get remote node data from Supabase
   */
  private async getRemoteNode(nodeId: string): Promise<RemoteNodeData | null> {
    try {
      const supabase = getSupabaseClient(this.env)
      const { data: node, error } = await supabase
        .from('remote_nodes')
        .select('*')
        .eq('id', nodeId)
        .single()

      if (error || !node) {
        console.error(`[GitService] Failed to get remote node ${nodeId}:`, error)
        return null
      }

      // Map Supabase data to RemoteNodeData format
      const nodeData: RemoteNodeData = {
        id: node.id,
        name: node.name,
        host: node.host,
        port: node.port,
        username: node.username,
        authType: node.auth_type,
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
          'Content-Type': 'application/json'
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
            const errorData = await response.json().catch(() => ({ error: 'Failed to execute SSH command' })) as { error?: string; commandId?: string }
            const isTimeout = response.status === 408 || (errorData.error && errorData.error.includes('timed out'))
            return {
              success: false,
              output: '',
              error: errorData.error || 'Unknown error',
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
    targetDir?: string
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
        console.log(`[Git Clone] Using SSH Service API endpoint: ${node.sshServiceApiUrl}/git-clone`)
        console.log(`[Git Clone] Target Project: ${projectName}`)
        console.log(`[Git Clone] Repository URL: ${repositoryUrl}`)
        console.log(`[Git Clone] Target Branch: ${branch}`)
        console.log(`[Git Clone] Working Home: ${workingHome}`)
        console.log(`[Git Clone] Target Dir: ${targetDir || 'auto-generated'}`)

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (node.sshServiceApiKey) {
          headers['Authorization'] = `Bearer ${node.sshServiceApiKey}`
        }

        const requestUrl = `${node.sshServiceApiUrl}/git-clone`
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

        console.log(`[Git Clone] Request URL: ${requestUrl}`)
        console.log(`[Git Clone] Request headers: ${JSON.stringify(Object.keys(headers))}`)
        console.log(`[Git Clone] Has API key: ${!!node.sshServiceApiKey}`)
        console.log(`[Git Clone] Request body keys: ${JSON.stringify(Object.keys(requestBody))}`)

        // Add timeout (5 minutes for git clone)
        const timeout = 300000 // 5 minutes
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          console.error(`[Git Clone] Timeout reached after ${timeout}ms, aborting request`)
          controller.abort()
        }, timeout)

        let response: Response
        const fetchStartTime = Date.now()
        console.log(`[Git Clone] Starting fetch request at ${new Date().toISOString()}`)
        try {
          response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          const fetchDuration = Date.now() - fetchStartTime
          console.log(`[Git Clone] Fetch completed in ${fetchDuration}ms, status: ${response.status}`)
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
        console.log(`[Git Clone] Response status: ${response.status} ${response.statusText}`)
        console.log(`[Git Clone] Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`)
        console.log(`[Git Clone] Starting to read response body...`)

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Failed to read error response')
          const errorReadTime = Date.now() - responseStartTime
          console.log(`[Git Clone] Error response read in ${errorReadTime}ms`)
          let errorData: { error?: string } = { error: 'Failed to execute git clone' }
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` }
          }
          console.error(`[Git Clone] Failed with status ${response.status}: ${errorData.error || 'Unknown error'}`)
          console.error(`[Git Clone] Full error response: ${errorText}`)
          return {
            success: false,
            output: '',
            error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
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
          console.log(`[Git Clone] Response body read in ${jsonParseTime}ms, length: ${jsonText.length} characters`)
          result = JSON.parse(jsonText) as typeof result
        } catch (parseError) {
          const parseDuration = Date.now() - responseStartTime
          console.error(`[Git Clone] Failed to parse JSON response after ${parseDuration}ms:`, parseError)
          return {
            success: false,
            output: '',
            error: `Failed to parse response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            targetDir: undefined
          }
        }

        console.log(`[Git Clone] Response parsed successfully, success: ${result.success}`)
        console.log(`[Git Clone] Response has output: ${!!result.output}, has stdout: ${!!result.stdout}, has stderr: ${!!result.stderr}, has combined: ${!!result.combined}`)
        if (result.exitCode !== undefined) {
          console.log(`[Git Clone] Exit code: ${result.exitCode}`)
        }

        // Use combined output if available (includes both stdout and stderr), otherwise fall back to output
        const fullOutput = result.combined || result.stdout || result.output || ''
        const errorOutput = result.stderr || result.error || ''

        // Log output to console for debugging
        if (fullOutput) {
          console.log(`[Git Clone] Output length: ${fullOutput.length} characters`)
          console.log(`[Git Clone] Output (first 500 chars):\n${fullOutput.substring(0, 500)}`)
          if (fullOutput.length > 500) {
            console.log(`[Git Clone] ... (truncated, ${fullOutput.length - 500} more characters)`)
          }
        } else {
          console.log(`[Git Clone] No output received from API`)
        }

        // Extract target directory from output if available
        const targetDirMatch = fullOutput.match(/TARGET_DIR=([^\n]+)/)
        const extractedTargetDir = targetDirMatch ? targetDirMatch[1] : undefined

        if (result.success) {
          console.log(`[Git Clone] Success! Repository cloned to: ${extractedTargetDir || 'unknown'}`)
        } else {
          console.error(`[Git Clone] Failed: ${errorOutput || 'Unknown error'}`)
          if (fullOutput) {
            console.error(`[Git Clone] Error output: ${fullOutput}`)
          }
        }

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

    // Log clone operation start
    console.log(`[Git Clone] Starting inline clone operation`)
    console.log(`[Git Clone] Target Project: ${projectName}`)
    console.log(`[Git Clone] Repository URL: ${repositoryUrl}`)
    console.log(`[Git Clone] Target Branch: ${branch}`)
    console.log(`[Git Clone] Working Home: ${workingHome}`)
    console.log(`[Git Clone] Target Directory: ${fullTargetDir}`)

    // Execute the bash script
    const result = await this.executeSSHCommand(node, bashScript)

    // Extract target directory from output if available
    const targetDirMatch = result.output.match(/TARGET_DIR=([^\n]+)/)
    const extractedTargetDir = targetDirMatch ? targetDirMatch[1] : fullTargetDir

    // Log output to console
    if (result.output) {
      console.log(`[Git Clone] Output:\n${result.output}`)
    }
    if (result.success) {
      console.log(`[Git Clone] Success! Repository cloned to: ${extractedTargetDir}`)
    } else {
      console.error(`[Git Clone] Failed: ${result.error || 'Unknown error'}`)
    }

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
      const cloneResult = await this.cloneRepository(nodeId, repositoryUrl, branch, workDir)
      const cloneDuration = Date.now() - cloneStartTime
      console.log(`[Git Workflow] Clone completed in ${cloneDuration}ms`)
      if (onLog) await onLog(`[Info] Git clone command completed in ${Math.round(cloneDuration / 1000)} seconds`)
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
            await onLog(`[Debug] Raw output (first 200 chars): ${cloneResult.output.substring(0, 200)}`)
          }
        } else {
          await onLog('[Warning] Git clone command executed but no output was captured')
          if (cloneResult.error) {
            await onLog(`[Error] Clone error: ${cloneResult.error}`)
          }
        }
      }

      if (!cloneResult.success) {
        if (onLog) {
          await onLog(`[Error] Git clone failed: ${cloneResult.error || 'Unknown error'}`)
          if (cloneResult.error && cloneResult.error !== cloneResult.output) {
            await onLog(`[Error Details] ${cloneResult.error}`)
          }
        }
        console.error(`[Git Workflow] Clone failed: ${cloneResult.error}`)
        return {
          success: false,
          results,
          error: `Failed to clone repository: ${cloneResult.error}`
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


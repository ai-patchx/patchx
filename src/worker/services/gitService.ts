import { Env } from '../types'
import { getKvNamespace, KVLike } from '../kv'

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
}

export class GitService {
  private env: Env
  private kv: KVLike

  constructor(env: Env) {
    this.env = env
    this.kv = getKvNamespace(env)
  }

  /**
   * Get remote node data from KV storage
   */
  private async getRemoteNode(nodeId: string): Promise<RemoteNodeData | null> {
    const nodeData = await this.kv.get(`remote_nodes:${nodeId}`, 'json')
    return nodeData as RemoteNodeData | null
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
            command: fullCommand
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to execute SSH command' })) as { error?: string }
          return {
            success: false,
            output: '',
            error: errorData.error || 'Unknown error'
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
        }
        // Use combined output if available (includes both stdout and stderr), otherwise fall back to output
        const fullOutput = result.combined || result.stdout || result.output || ''
        const errorOutput = result.stderr || result.error || ''
        return {
          success: result.success,
          output: fullOutput,
          error: result.success ? undefined : (errorOutput || result.error)
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

        const response = await fetch(`${node.sshServiceApiUrl}/git-clone`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
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
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to execute git clone' })) as { error?: string }
          console.error(`[Git Clone] Failed: ${errorData.error || 'Unknown error'}`)
          return {
            success: false,
            output: '',
            error: errorData.error || 'Unknown error',
            targetDir: undefined
          }
        }

        const result = await response.json() as { success: boolean; output?: string; error?: string }

        // Extract target directory from output if available
        const targetDirMatch = result.output?.match(/TARGET_DIR=([^\n]+)/)
        const extractedTargetDir = targetDirMatch ? targetDirMatch[1] : undefined

        // Log output to console for debugging
        if (result.output) {
          console.log(`[Git Clone] Output:\n${result.output}`)
        }
        if (result.success) {
          console.log(`[Git Clone] Success! Repository cloned to: ${extractedTargetDir || 'unknown'}`)
        } else {
          console.error(`[Git Clone] Failed: ${result.error || 'Unknown error'}`)
        }

        return {
          success: result.success,
          output: result.output || '',
          error: result.error,
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

    // Build git apply command
    let applyCommand = 'git apply'
    if (options?.check) {
      applyCommand += ' --check'
    }
    if (options?.reverse) {
      applyCommand += ' --reverse'
    }
    if (options?.directory) {
      applyCommand += ` --directory=${options.directory}`
    }
    applyCommand += ` ${patchFileName}`

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
      ? `git checkout -b ${branch}`
      : `git checkout ${branch}`

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
   */
  async executeGitWorkflow(
    nodeId: string,
    repositoryUrl: string,
    branch: string,
    patchContent: string,
    workDir?: string
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
      const node = await this.getRemoteNode(nodeId)
      if (!node) {
        console.error(`[Git Workflow] Remote node ${nodeId} not found`)
        return {
          success: false,
          results,
          error: `Remote node ${nodeId} not found`
        }
      }

      // Step 1: Clone repository (will use working home from node config)
      console.log(`[Git Workflow] Step 1: Cloning repository...`)
      const cloneResult = await this.cloneRepository(nodeId, repositoryUrl, branch, workDir)
      results.clone = cloneResult
      if (!cloneResult.success) {
        console.error(`[Git Workflow] Clone failed: ${cloneResult.error}`)
        return {
          success: false,
          results,
          error: `Failed to clone repository: ${cloneResult.error}`
        }
      }
      console.log(`[Git Workflow] Step 1: Clone completed successfully`)

      // Use the target directory from clone result
      const actualWorkDir = cloneResult.targetDir || workDir || '/tmp/git-work'
      console.log(`[Git Workflow] Working directory: ${actualWorkDir}`)

      // Step 2: Checkout branch (if needed) - clone already checks out the branch, but verify
      console.log(`[Git Workflow] Step 2: Checking out branch: ${branch}...`)
      const checkoutResult = await this.checkoutBranch(nodeId, actualWorkDir, branch)
      results.checkout = checkoutResult
      if (!checkoutResult.success) {
        // Non-fatal: branch might already be checked out
        console.warn(`[Git Workflow] Checkout warning: ${checkoutResult.error}`)
      } else {
        console.log(`[Git Workflow] Step 2: Branch checkout completed`)
      }

      // Step 3: Apply patch
      console.log(`[Git Workflow] Step 3: Applying patch...`)
      const applyResult = await this.applyPatch(nodeId, patchContent, actualWorkDir, { check: false })
      results.apply = applyResult
      if (!applyResult.success) {
        console.error(`[Git Workflow] Patch apply failed: ${applyResult.error}`)
        return {
          success: false,
          results,
          error: `Failed to apply patch: ${applyResult.error}`
        }
      }
      console.log(`[Git Workflow] Step 3: Patch applied successfully`)

      // Step 4: Get status
      console.log(`[Git Workflow] Step 4: Getting repository status...`)
      const statusResult = await this.getStatus(nodeId, actualWorkDir)
      results.status = statusResult
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
      return {
        success: false,
        results,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}


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

    // Placeholder: In production, this would execute the command via SSH
    // Example using a separate SSH service:
    // const response = await fetch('https://your-ssh-service.com/execute', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     host: node.host,
    //     port: node.port,
    //     username: node.username,
    //     authType: node.authType,
    //     sshKey: node.sshKey,
    //     password: node.password,
    //     command: fullCommand
    //   })
    // })

    throw new Error(
      'SSH execution not implemented. Please set up an SSH service or use a library that supports SSH in Cloudflare Workers.'
    )
  }

  /**
   * Clone a git repository on a remote node
   */
  async cloneRepository(
    nodeId: string,
    repositoryUrl: string,
    branch: string,
    targetDir: string
  ): Promise<GitCommandResult> {
    const node = await this.getRemoteNode(nodeId)
    if (!node) {
      return {
        success: false,
        output: '',
        error: `Remote node ${nodeId} not found`
      }
    }

    // Create target directory if it doesn't exist
    const mkdirCommand = `mkdir -p ${targetDir}`
    const mkdirResult = await this.executeSSHCommand(node, mkdirCommand)
    if (!mkdirResult.success) {
      return mkdirResult
    }

    // Clone the repository
    const cloneCommand = `git clone -b ${branch} ${repositoryUrl} ${targetDir}`
    return await this.executeSSHCommand(node, cloneCommand)
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
   */
  async executeGitWorkflow(
    nodeId: string,
    repositoryUrl: string,
    branch: string,
    patchContent: string,
    workDir: string = '/tmp/git-work'
  ): Promise<{
    success: boolean
    results: {
      clone?: GitCommandResult
      checkout?: GitCommandResult
      apply?: GitCommandResult
      status?: GitCommandResult
    }
    error?: string
  }> {
    const results: {
      clone?: GitCommandResult
      checkout?: GitCommandResult
      apply?: GitCommandResult
      status?: GitCommandResult
    } = {}

    try {
      // Step 1: Clone repository
      const cloneResult = await this.cloneRepository(nodeId, repositoryUrl, branch, workDir)
      results.clone = cloneResult
      if (!cloneResult.success) {
        return {
          success: false,
          results,
          error: `Failed to clone repository: ${cloneResult.error}`
        }
      }

      // Step 2: Checkout branch (if needed)
      const checkoutResult = await this.checkoutBranch(nodeId, workDir, branch)
      results.checkout = checkoutResult
      if (!checkoutResult.success) {
        return {
          success: false,
          results,
          error: `Failed to checkout branch: ${checkoutResult.error}`
        }
      }

      // Step 3: Apply patch
      const applyResult = await this.applyPatch(nodeId, patchContent, workDir, { check: false })
      results.apply = applyResult
      if (!applyResult.success) {
        return {
          success: false,
          results,
          error: `Failed to apply patch: ${applyResult.error}`
        }
      }

      // Step 4: Get status
      const statusResult = await this.getStatus(nodeId, workDir)
      results.status = statusResult

      return {
        success: true,
        results
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


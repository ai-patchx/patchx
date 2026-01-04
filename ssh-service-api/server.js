#!/usr/bin/env node

/**
 * SSH Service API
 *
 * A simple HTTP API service that executes SSH commands on remote servers.
 * This service runs on your Ubuntu node and accepts requests from Cloudflare Workers.
 *
 * Usage:
 *   POST /execute
 *   Body: {
 *     host: string,
 *     port: number,
 *     username: string,
 *     authType: 'key' | 'password',
 *     sshKey?: string,
 *     password?: string,
 *     command: string
 *   }
 *
 *   Response: {
 *     success: boolean,
 *     output: string,
 *     error?: string
 *   }
 */

const express = require('express')
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 7000
const API_KEY = process.env.API_KEY || '' // Optional API key for authentication
const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT || '300000', 10) // Default 5 minutes

// Track active command executions for cancellation
const activeCommands = new Map() // commandId -> { sshClient, stream, timeoutId, startTime }

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// CORS middleware (adjust origins as needed)
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['*']
  const origin = req.headers.origin

  // Allow requests without origin (server-to-server requests like Cloudflare Workers)
  // If no origin header, allow if ALLOWED_ORIGINS includes '*' or is empty
  if (!origin) {
    if (allowedOrigins.includes('*') || allowedOrigins.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
  } else if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

// Optional API key authentication
const authenticate = (req, res, next) => {
  if (!API_KEY) {
    return next() // No authentication required
  }

  const authHeader = req.headers.authorization

  // Log authentication attempt for debugging (without sensitive data)
  if (req.path === '/execute') {
    console.log(`[AUTH] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}, User-Agent: ${req.headers['user-agent'] || 'none'}, Has Auth: ${!!authHeader}`)
  }

  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    console.log(`[AUTH] Failed - Expected: Bearer ${API_KEY ? '***' : 'none'}, Got: ${authHeader ? authHeader.substring(0, 20) + '...' : 'none'}`)
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Missing or invalid API key.'
    })
  }
  next()
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Git clone template script (non-interactive version)
const GIT_CLONE_SCRIPT_TEMPLATE = `#!/bin/bash
set -e
set -u

TARGET_PROJECT="\$1"
TARGET_BRANCH="\$2"
GERRIT_BASE_URL="\$3"
WORKING_HOME="\$4"
TARGET_DIR="\$5"

# Log function for console output
log_info() {
    echo "[INFO] \$1"
}

log_success() {
    echo "[SUCCESS] \$1"
}

log_warn() {
    echo "[WARN] \$1" >&2
}

log_error() {
    echo "[ERROR] \$1" >&2
}

# Validate required parameters
if [ -z "$TARGET_PROJECT" ]; then
    log_error "TARGET_PROJECT (project name) is required"
    exit 1
fi

if [ -z "$TARGET_BRANCH" ]; then
    log_error "TARGET_BRANCH is required"
    exit 1
fi

if [ -z "$GERRIT_BASE_URL" ]; then
    log_error "GERRIT_BASE_URL is required"
    exit 1
fi

# Construct repository URL from GERRIT_BASE_URL and project name
# Format: https://android-review.googlesource.com/platform/frameworks/base
GERRIT_BASE_URL="\${GERRIT_BASE_URL%/}"  # Remove trailing slash if present
REPOSITORY_URL="$GERRIT_BASE_URL/$TARGET_PROJECT"

# Set default working home if not provided
if [ -z "\$WORKING_HOME" ]; then
    WORKING_HOME="\$HOME/git-work"
fi

# Expand ~ to $HOME if WORKING_HOME starts with ~
# This handles cases where ~ is passed as a literal string (e.g., "~/git-work")
# Check if WORKING_HOME starts with ~ (not using glob pattern to avoid issues)
if [ "\${WORKING_HOME:0:1}" = "~" ]; then
    # Replace ~ with $HOME using parameter expansion
    WORKING_HOME="\${WORKING_HOME/#\\~/\$HOME}"
fi

# Expand $HOME if it's still a literal string (e.g., "$HOME/git-work" passed from JavaScript)
# This happens when $HOME is passed as a literal string in quotes
if echo "\$WORKING_HOME" | grep -q '\$HOME'; then
    # Use eval to expand $HOME, but be safe about it
    WORKING_HOME=\$(eval echo "\$WORKING_HOME")
fi

log_info "Starting git clone operation"
log_info "Repository URL: \$REPOSITORY_URL"
log_info "Project: \$TARGET_PROJECT"
log_info "Branch: \$TARGET_BRANCH"
log_info "Working Home: \$WORKING_HOME"

# Create working home directory if it doesn't exist
if [ ! -d "\$WORKING_HOME" ]; then
    log_info "Creating working home directory: \$WORKING_HOME"
    mkdir -p "\$WORKING_HOME" || { log_error "Failed to create working home directory: \$WORKING_HOME"; exit 1; }
fi

# Generate target directory name from project name if not provided
if [ -z "\$TARGET_DIR" ]; then
    # Extract repository name from project path
    # Handle formats: platform/frameworks/base -> base
    REPO_NAME=\$(basename "\$TARGET_PROJECT")
    # Sanitize branch name for use in directory name
    SANITIZED_BRANCH=\$(echo "\$TARGET_BRANCH" | sed 's/[^a-zA-Z0-9_-]/_/g')
    TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
    TARGET_DIR="\${REPO_NAME}_\${SANITIZED_BRANCH}_\${TIMESTAMP}"
fi

# Full path to target directory
FULL_TARGET_DIR="\$WORKING_HOME/\$TARGET_DIR"

# Check if target directory already exists
# In non-interactive mode, automatically remove and re-clone for consistency
if [ -d "\$FULL_TARGET_DIR" ]; then
    log_warn "Target directory already exists: \$FULL_TARGET_DIR"
    log_info "Removing existing directory for clean clone (non-interactive mode)..."
    rm -rf "\$FULL_TARGET_DIR" || { log_error "Failed to remove existing directory: \$FULL_TARGET_DIR"; exit 1; }
    log_info "Existing directory removed successfully"
fi

# Clone the repository
log_info "Cloning repository: \$REPOSITORY_URL"
log_info "Project: \$TARGET_PROJECT"
log_info "Branch: \$TARGET_BRANCH"
log_info "Target directory: \$FULL_TARGET_DIR"

cd "\$WORKING_HOME" || { log_error "Failed to change to working home directory: \$WORKING_HOME"; exit 1; }

# Clone with branch specification
log_info "Executing git clone command..."
if git clone -b "\$TARGET_BRANCH" --depth 1 "\$REPOSITORY_URL" "\$TARGET_DIR"; then
    log_success "Repository cloned successfully to: \$FULL_TARGET_DIR"

    # Verify the clone
    cd "\$FULL_TARGET_DIR" || { log_error "Failed to change to cloned directory"; exit 1; }

    # Check current branch
    CURRENT_BRANCH=\$(git rev-parse --abbrev-ref HEAD)
    log_info "Current branch: \$CURRENT_BRANCH"

    # Show repository status
    log_info "Repository status:"
    git status --short || true

    # Output the target directory path for use by calling script
    echo "TARGET_DIR=\$FULL_TARGET_DIR"
    exit 0
else
    log_error "Failed to clone repository: \$REPOSITORY_URL"
    exit 1
fi
`

// Git clone endpoint
app.post('/git-clone', authenticate, async (req, res) => {
  const { host, port, username, authType, sshKey, password, repositoryUrl, project, gerritBaseUrl, branch, workingHome, targetDir } = req.body

  // Support both old format (repositoryUrl) and new format (project + gerritBaseUrl)
  let targetProject = project
  let gerritUrl = gerritBaseUrl

  if (!targetProject && repositoryUrl) {
    // Extract project name from repository URL for backward compatibility
    if (gerritBaseUrl) {
      const baseUrl = gerritBaseUrl.replace(/\/$/, '')
      if (repositoryUrl.startsWith(baseUrl + '/')) {
        targetProject = repositoryUrl.substring(baseUrl.length + 1)
        gerritUrl = gerritBaseUrl
      }
    }
    // If we still don't have project, use repositoryUrl as-is (backward compatibility)
    if (!targetProject) {
      targetProject = repositoryUrl
      gerritUrl = gerritBaseUrl || ''
    }
  }

  // Validate required fields
  if (!host || !username || !authType || !targetProject || !branch) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: host, username, authType, project (or repositoryUrl), branch'
    })
  }

  if (!gerritUrl) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: gerritBaseUrl (or GERRIT_BASE_URL must be provided)'
    })
  }

  if (authType === 'key' && !sshKey) {
    return res.status(400).json({
      success: false,
      error: 'SSH key is required when authType is "key"'
    })
  }

  if (authType === 'password' && !password) {
    return res.status(400).json({
      success: false,
      error: 'Password is required when authType is "password"'
    })
  }

  const targetPort = port || 22
  const sshClient = new Client()
  let tempKeyFile = null
  let tempScriptFile = null
  const timeout = req.body.timeout || DEFAULT_TIMEOUT // Use request timeout or default
  let commandTimeoutId = null
  let commandStream = null

  try {
    // If using SSH key, write it to a temporary file
    if (authType === 'key' && sshKey) {
      tempKeyFile = path.join(os.tmpdir(), `ssh_key_${crypto.randomBytes(8).toString('hex')}`)
      fs.writeFileSync(tempKeyFile, sshKey, { mode: 0o600 })
    }

    // Connect to SSH server with timeout
    await Promise.race([
      new Promise((resolve, reject) => {
        const connectConfig = {
          host,
          port: targetPort,
          username,
          readyTimeout: 10000,
          ...(authType === 'key' && sshKey
            ? { privateKey: fs.readFileSync(tempKeyFile) }
            : { password })
        }

        sshClient.on('ready', () => {
          resolve()
        })

        sshClient.on('error', (err) => {
          reject(err)
        })

        sshClient.connect(connectConfig)
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`SSH connection timeout after 10 seconds`))
        }, 10000)
      })
    ])

    // Escape parameters for shell
    const escapeShell = (str) => {
      return str.replace(/'/g, "'\\''").replace(/(["$`\\])/g, '\\$1')
    }

    const escapedProject = escapeShell(targetProject)
    const escapedBranch = escapeShell(branch)
    const escapedGerritBaseUrl = escapeShell(gerritUrl)
    const escapedWorkingHome = workingHome ? escapeShell(workingHome) : ''
    const escapedTargetDir = targetDir ? escapeShell(targetDir) : ''

    // Create command to write script and execute it
    const scriptContent = GIT_CLONE_SCRIPT_TEMPLATE
    const scriptCommand = `cat > /tmp/git-clone-${crypto.randomBytes(4).toString('hex')}.sh << 'SCRIPT_EOF'
${scriptContent}
SCRIPT_EOF
bash /tmp/git-clone-*.sh '${escapedProject}' '${escapedBranch}' '${escapedGerritBaseUrl}' '${escapedWorkingHome}' '${escapedTargetDir}'; EXIT_CODE=$?; rm -f /tmp/git-clone-*.sh; exit $EXIT_CODE`

    // Execute command with timeout
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        sshClient.exec(scriptCommand, (err, stream) => {
          if (err) {
            reject(err)
            return
          }

          commandStream = stream
          let stdout = ''
          let stderr = ''

          stream.on('close', (code, signal) => {
            if (commandTimeoutId) {
              clearTimeout(commandTimeoutId)
              commandTimeoutId = null
            }
            sshClient.end()

            // Combine stdout and stderr for full output
            const fullOutput = stdout.trim()
            const fullError = stderr.trim()
            const combinedOutput = fullOutput + (fullError ? '\n' + fullError : '')

            if (code === 0) {
              resolve({
                success: true,
                output: fullOutput,
                stdout: fullOutput,
                stderr: fullError,
                combined: combinedOutput,
                exitCode: code
              })
            } else {
              resolve({
                success: false,
                output: combinedOutput,
                stdout: fullOutput,
                stderr: fullError,
                combined: combinedOutput,
                error: fullError || `Command exited with code ${code}`,
                exitCode: code
              })
            }
          })

          stream.on('data', (data) => {
            stdout += data.toString()
          })

          stream.stderr.on('data', (data) => {
            stderr += data.toString()
          })
        })
      }),
      new Promise((resolve) => {
        commandTimeoutId = setTimeout(() => {
          if (commandStream) {
            try {
              commandStream.destroy()
            } catch (e) {
              // Ignore destroy errors
            }
          }
          sshClient.end()
          resolve({
            success: false,
            output: '',
            stdout: '',
            stderr: '',
            combined: '',
            error: `Command execution timed out after ${timeout}ms`,
            exitCode: -1
          })
        }, timeout)
      })
    ])

    // Clean up temporary key file
    if (tempKeyFile && fs.existsSync(tempKeyFile)) {
      fs.unlinkSync(tempKeyFile)
    }

    res.json(result)

  } catch (error) {
    // Clear timeout if it exists
    if (commandTimeoutId) {
      clearTimeout(commandTimeoutId)
      commandTimeoutId = null
    }

    // Clean up temporary files on error
    if (tempKeyFile && fs.existsSync(tempKeyFile)) {
      try {
        fs.unlinkSync(tempKeyFile)
      } catch (unlinkError) {
        console.error('Failed to delete temp key file:', unlinkError)
      }
    }

    // Close SSH connection if still open
    if (sshClient) {
      try {
        sshClient.end()
      } catch (closeError) {
        // Ignore close errors
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute git clone',
      output: ''
    })
  }
})

// Cancel command endpoint
app.post('/cancel', authenticate, async (req, res) => {
  const { commandId } = req.body

  if (!commandId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: commandId'
    })
  }

  const commandInfo = activeCommands.get(commandId)
  if (!commandInfo) {
    return res.status(404).json({
      success: false,
      error: 'Command not found or already completed'
    })
  }

  try {
    // Clear timeout
    if (commandInfo.timeoutId) {
      clearTimeout(commandInfo.timeoutId)
    }

    // Kill the stream if it exists
    if (commandInfo.stream) {
      try {
        commandInfo.stream.destroy()
      } catch (err) {
        console.error('Error destroying stream:', err)
      }
    }

    // Close SSH connection
    if (commandInfo.sshClient) {
      try {
        commandInfo.sshClient.end()
      } catch (err) {
        console.error('Error closing SSH client:', err)
      }
    }

    // Remove from active commands
    activeCommands.delete(commandId)

    res.json({
      success: true,
      message: 'Command cancelled successfully'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel command'
    })
  }
})

// Execute SSH command endpoint
app.post('/execute', authenticate, async (req, res) => {
  const { host, port, username, authType, sshKey, password, command, timeout } = req.body

  // Validate required fields
  if (!host || !username || !authType || !command) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: host, username, authType, command'
    })
  }

  if (authType === 'key' && !sshKey) {
    return res.status(400).json({
      success: false,
      error: 'SSH key is required when authType is "key"'
    })
  }

  if (authType === 'password' && !password) {
    return res.status(400).json({
      success: false,
      error: 'Password is required when authType is "password"'
    })
  }

  const targetPort = port || 22
  const commandTimeout = timeout || DEFAULT_TIMEOUT
  const commandId = crypto.randomBytes(16).toString('hex')
  const sshClient = new Client()
  let tempKeyFile = null
  let timeoutId = null
  let commandStream = null

  try {
    // If using SSH key, write it to a temporary file
    if (authType === 'key' && sshKey) {
      tempKeyFile = path.join(os.tmpdir(), `ssh_key_${crypto.randomBytes(8).toString('hex')}`)
      fs.writeFileSync(tempKeyFile, sshKey, { mode: 0o600 })
    }

    // Connect to SSH server
    await new Promise((resolve, reject) => {
      const connectConfig = {
        host,
        port: targetPort,
        username,
        readyTimeout: 10000,
        ...(authType === 'key' && sshKey
          ? { privateKey: fs.readFileSync(tempKeyFile) }
          : { password })
      }

      sshClient.on('ready', () => {
        resolve()
      })

      sshClient.on('error', (err) => {
        reject(err)
      })

      sshClient.connect(connectConfig)
    })

    // Execute command
    const result = await new Promise((resolve, reject) => {
      sshClient.exec(command, (err, stream) => {
        if (err) {
          activeCommands.delete(commandId)
          reject(err)
          return
        }

        commandStream = stream

        // Store command info for cancellation
        activeCommands.set(commandId, {
          sshClient,
          stream,
          timeoutId: null,
          startTime: Date.now()
        })

        // Set up timeout
        timeoutId = setTimeout(() => {
          activeCommands.delete(commandId)
          try {
            stream.destroy()
            sshClient.end()
          } catch (err) {
            console.error('Error during timeout cleanup:', err)
          }
          reject(new Error(`Command execution timed out after ${commandTimeout}ms`))
        }, commandTimeout)

        // Update timeout ID in active commands
        const commandInfo = activeCommands.get(commandId)
        if (commandInfo) {
          commandInfo.timeoutId = timeoutId
        }

        let stdout = ''
        let stderr = ''
        let stdoutLines = []
        let stderrLines = []

        stream.on('close', (code, signal) => {
          // Clear timeout
          if (timeoutId) {
            clearTimeout(timeoutId)
          }

          // Remove from active commands
          activeCommands.delete(commandId)

          sshClient.end()

          // Combine stdout and stderr for full output, preserving order where possible
          // stderr is typically interleaved, so we include both
          const fullOutput = stdout.trim()
          const fullError = stderr.trim()
          const combinedOutput = fullOutput + (fullError ? '\n' + fullError : '')

          if (code === 0) {
            resolve({
              success: true,
              output: fullOutput,
              stdout: fullOutput,
              stderr: fullError,
              combined: combinedOutput,
              exitCode: code,
              commandId
            })
          } else {
            resolve({
              success: false,
              output: combinedOutput,
              stdout: fullOutput,
              stderr: fullError,
              combined: combinedOutput,
              error: fullError || `Command exited with code ${code}`,
              exitCode: code,
              commandId
            })
          }
        })

        stream.on('data', (data) => {
          const text = data.toString()
          stdout += text
          // Split into lines for better log handling
          const lines = text.split('\n').filter(l => l.trim())
          stdoutLines.push(...lines)
        })

        stream.stderr.on('data', (data) => {
          const text = data.toString()
          stderr += text
          // Split into lines for better log handling
          const lines = text.split('\n').filter(l => l.trim())
          stderrLines.push(...lines)
        })

        stream.on('error', (err) => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          activeCommands.delete(commandId)
          reject(err)
        })
      })
    })

    // Clean up temporary key file
    if (tempKeyFile && fs.existsSync(tempKeyFile)) {
      fs.unlinkSync(tempKeyFile)
    }

    res.json(result)

  } catch (error) {
    // Clean up on error
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    activeCommands.delete(commandId)

    // Clean up temporary key file on error
    if (tempKeyFile && fs.existsSync(tempKeyFile)) {
      try {
        fs.unlinkSync(tempKeyFile)
      } catch (unlinkError) {
        console.error('Failed to delete temp key file:', unlinkError)
      }
    }

    // Close SSH connection if still open
    if (sshClient) {
      try {
        sshClient.end()
      } catch (closeError) {
        // Ignore close errors
      }
    }

    const isTimeout = error.message && error.message.includes('timed out')
    res.status(isTimeout ? 408 : 500).json({
      success: false,
      error: error.message || 'Failed to execute SSH command',
      output: '',
      commandId: isTimeout ? commandId : undefined
    })
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    output: ''
  })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SSH Service API listening on port ${PORT}`)
  if (API_KEY) {
    console.log('API key authentication enabled')
  } else {
    console.warn('⚠️  Warning: API key authentication is disabled. Set API_KEY environment variable for security.')
  }
})

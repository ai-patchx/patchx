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
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || '' // Optional API key for authentication

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// CORS middleware (adjust origins as needed)
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*']
  const origin = req.headers.origin

  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
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
  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
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

// Execute SSH command endpoint
app.post('/execute', authenticate, async (req, res) => {
  const { host, port, username, authType, sshKey, password, command } = req.body

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
  const sshClient = new Client()
  let tempKeyFile = null

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
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream.on('close', (code, signal) => {
          sshClient.end()

          if (code === 0) {
            resolve({ success: true, output: stdout.trim() })
          } else {
            resolve({
              success: false,
              output: stdout.trim(),
              error: stderr.trim() || `Command exited with code ${code}`
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
    })

    // Clean up temporary key file
    if (tempKeyFile && fs.existsSync(tempKeyFile)) {
      fs.unlinkSync(tempKeyFile)
    }

    res.json(result)

  } catch (error) {
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

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute SSH command',
      output: ''
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

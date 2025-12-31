export interface Upload {
  id: string
  filename: string
  content: string
  project: string
  validationStatus: 'valid' | 'invalid'
  validationError?: string
  createdAt: string
}

export interface Submission {
  id: string
  uploadId: string
  filename: string
  project: string
  subject: string
  description: string
  branch: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  changeId?: string
  changeUrl?: string
  error?: string
  notificationEmails?: string[]
  notificationCc?: string[]
  remoteNodeId?: string
  gitRepository?: string
  logs?: string[]
  createdAt: string
  updatedAt: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface UploadResponse {
  uploadId: string
  status: string
  message: string
}

export interface SubmitResponse {
  changeId: string
  changeUrl: string
  status: string
}

export interface StatusResponse {
  status: string
  changeId?: string
  changeUrl?: string
  createdAt: string
  error?: string
  logs?: string[]
}

export interface RemoteNode {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'key' | 'password'
  sshKey?: string // Private SSH key content
  password?: string // Encrypted password
  workingHome?: string // Working directory path on the remote node
  sshServiceApiUrl?: string // SSH service API URL for command execution
  sshServiceApiKey?: string // SSH service API key for authentication
  createdAt: string
  updatedAt: string
}

export interface RemoteNodeFormData {
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
}
import * as vscode from 'vscode'
import type { PatchxStatusResponse, PatchxSubmitResponse, PatchxUploadResponse } from './types'

type ClientOptions = {
  baseUrl: string
  authToken?: string
}

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, '')
}

async function readJson<T>(resp: Response): Promise<T> {
  const text = await resp.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Non-JSON response (${resp.status}): ${text.slice(0, 500)}`)
  }
}

function buildHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (authToken && authToken.trim().length > 0) {
    headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
  }
  return headers
}

export class PatchxClient {
  private readonly baseUrl: string
  private readonly authToken?: string

  constructor(opts: ClientOptions) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl)
    this.authToken = opts.authToken
  }

  async login(params: { username: string; password: string }): Promise<{ user: unknown; token: string; message?: string }> {
    const resp = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    })

    if (!resp.ok) {
      // Worker login returns { message } on error
      const raw = await resp.text()
      throw new Error(`Login failed (${resp.status}): ${raw.slice(0, 500)}`)
    }

    const data = await readJson<{ user: unknown; token: string; message?: string }>(resp)
    if (!data?.token) throw new Error('Login response missing token')
    return data
  }

  async uploadPatchFile(params: { fileUri: vscode.Uri; project: string }): Promise<PatchxUploadResponse> {
    const { fileUri, project } = params
    const bytes = await vscode.workspace.fs.readFile(fileUri)
    const filename = fileUri.path.split('/').pop() || 'patch.diff'

    // Use the platform FormData/Blob provided by VS Code's runtime (Node/undici).
    const form = new FormData()
    form.append('project', project)
    form.append('file', new Blob([bytes]), filename)

    const resp = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: buildHeaders(this.authToken),
      body: form
    })

    return await readJson<PatchxUploadResponse>(resp)
  }

  async submit(params: {
    uploadId: string
    subject: string
    description: string
    branch: string
    remoteNodeId?: string
    project?: string
  }): Promise<PatchxSubmitResponse> {
    const resp = await fetch(`${this.baseUrl}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildHeaders(this.authToken)
      },
      body: JSON.stringify(params)
    })

    return await readJson<PatchxSubmitResponse>(resp)
  }

  async status(submissionId: string): Promise<PatchxStatusResponse> {
    const resp = await fetch(`${this.baseUrl}/api/status/${encodeURIComponent(submissionId)}`, {
      method: 'GET',
      headers: buildHeaders(this.authToken)
    })

    return await readJson<PatchxStatusResponse>(resp)
  }

  /** GET /api/nodes - list remote nodes for defaultRemoteNodeId selection */
  async getNodes(): Promise<{ success: boolean; data?: Array<{ id: string; name?: string }>; error?: string }> {
    const resp = await fetch(`${this.baseUrl}/api/nodes`, {
      method: 'GET',
      headers: buildHeaders(this.authToken)
    })
    return await readJson<{ success: boolean; data?: Array<{ id: string; name?: string }>; error?: string }>(resp)
  }
}


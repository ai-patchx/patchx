import * as vscode from 'vscode'
import { PatchxClient } from './patchxClient'

const SECRET_AUTH_TOKEN = 'patchx.authToken'
const STATE_LAST_UPLOAD_ID = 'patchx.lastUploadId'
const STATE_LAST_SUBMISSION_ID = 'patchx.lastSubmissionId'

function getSettings() {
  const cfg = vscode.workspace.getConfiguration('patchx')
  const baseUrl = (cfg.get<string>('baseUrl') || '').trim()
  const defaultProject = (cfg.get<string>('defaultProject') || '').trim()
  const defaultBranch = (cfg.get<string>('defaultBranch') || 'refs/heads/master').trim()
  const defaultRemoteNodeId = (cfg.get<string>('defaultRemoteNodeId') || '').trim()
  const pollIntervalMs = Math.max(500, cfg.get<number>('pollIntervalMs') ?? 2000)
  const autoOpenChangeUrl = cfg.get<boolean>('autoOpenChangeUrl') ?? true

  return {
    baseUrl,
    defaultProject,
    defaultBranch,
    defaultRemoteNodeId,
    pollIntervalMs,
    autoOpenChangeUrl
  }
}

async function getClient(ctx: vscode.ExtensionContext): Promise<PatchxClient> {
  const { baseUrl } = getSettings()
  if (!baseUrl) {
    throw new Error('Missing PatchX base URL. Set `patchx.baseUrl` in settings.')
  }
  const authToken = await ctx.secrets.get(SECRET_AUTH_TOKEN)
  return new PatchxClient({ baseUrl, authToken: authToken || undefined })
}

function getUploadIdFromUploadResponse(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>
  const uploadId = obj.uploadId
  const id = obj.id
  if (typeof uploadId === 'string' && uploadId.length > 0) return uploadId
  if (typeof id === 'string' && id.length > 0) return id
  return undefined
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('PatchX')

  const log = (msg: string) => {
    output.appendLine(`[${new Date().toISOString()}] ${msg}`)
    output.show(true)
  }

  context.subscriptions.push(output)

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.setAuthToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'PatchX Auth Token',
        prompt: 'Optional. Stored securely in VS Code Secret Storage. Provide either a raw token or "Bearer <token>".',
        password: true,
        ignoreFocusOut: true
      })
      if (token === undefined) return
      await context.secrets.store(SECRET_AUTH_TOKEN, token)
      vscode.window.showInformationMessage('PatchX auth token saved.')
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.login', async () => {
      const username = await vscode.window.showInputBox({
        title: 'PatchX Username',
        prompt: 'Default accounts are usually "patchx" or "admin".',
        value: 'patchx',
        ignoreFocusOut: true
      })
      if (!username) return

      const password = await vscode.window.showInputBox({
        title: 'PatchX Password',
        prompt: 'Password for /api/auth/login (stored only in memory for this request).',
        password: true,
        ignoreFocusOut: true
      })
      if (!password) return

      const client = await getClient(context)
      log(`Logging in as "${username}"...`)
      try {
        const res = await client.login({ username, password })
        await context.secrets.store(SECRET_AUTH_TOKEN, res.token)
        vscode.window.showInformationMessage('PatchX login succeeded. Token saved.')
        log(`Login ok. message=${res.message ?? '(none)'}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log(`Login failed: ${msg}`)
        vscode.window.showErrorMessage(`PatchX login failed: ${msg}`)
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.clearAuthToken', async () => {
      await context.secrets.delete(SECRET_AUTH_TOKEN)
      vscode.window.showInformationMessage('PatchX auth token cleared.')
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.uploadPatchFile', async () => {
      const settings = getSettings()
      const picked = await vscode.window.showOpenDialog({
        title: 'Select a patch file to upload',
        canSelectMany: false,
        filters: {
          'Patch files': ['patch', 'diff'],
          'All files': ['*']
        }
      })
      if (!picked?.[0]) return

      const project = await vscode.window.showInputBox({
        title: 'Target Project',
        prompt: 'Used as `project` form field for /api/upload (e.g. platform/frameworks/base).',
        value: settings.defaultProject,
        ignoreFocusOut: true
      })
      if (!project) return

      const client = await getClient(context)
      log(`Uploading patch: ${picked[0].fsPath}`)
      const resp = await client.uploadPatchFile({ fileUri: picked[0], project })

      if (!resp.success) {
        log(`Upload failed: ${resp.error}`)
        vscode.window.showErrorMessage(`PatchX upload failed: ${resp.error}`)
        return
      }

      const uploadId = getUploadIdFromUploadResponse(resp.data)
      if (uploadId) {
        await context.globalState.update(STATE_LAST_UPLOAD_ID, uploadId)
      }

      log(`Upload success. uploadId=${uploadId ?? '(unknown)'}`)
      vscode.window.showInformationMessage(`PatchX upload success${uploadId ? ` (uploadId: ${uploadId})` : ''}`)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.submitLastUpload', async () => {
      const settings = getSettings()
      const lastUploadId = context.globalState.get<string>(STATE_LAST_UPLOAD_ID) || ''

      const uploadId = await vscode.window.showInputBox({
        title: 'Upload ID',
        prompt: 'Upload ID from /api/upload response.',
        value: lastUploadId,
        ignoreFocusOut: true
      })
      if (!uploadId) return

      const subject = await vscode.window.showInputBox({
        title: 'Commit Subject',
        prompt: 'Required for /api/submit.',
        value: '',
        ignoreFocusOut: true
      })
      if (!subject) return

      const description = await vscode.window.showInputBox({
        title: 'Commit Description',
        prompt: 'Optional.',
        value: '',
        ignoreFocusOut: true
      })
      if (description === undefined) return

      const branch = await vscode.window.showInputBox({
        title: 'Target Branch',
        prompt: 'Gerrit target ref (e.g. refs/heads/master).',
        value: settings.defaultBranch,
        ignoreFocusOut: true
      })
      if (!branch) return

      const remoteNodeId = (await vscode.window.showInputBox({
        title: 'Remote Node ID (optional)',
        prompt: 'If provided, PatchX will use the remote node flow. When set, project is required.',
        value: settings.defaultRemoteNodeId,
        ignoreFocusOut: true
      }))?.trim()

      const projectForRemote = remoteNodeId
        ? await vscode.window.showInputBox({
            title: 'Target Project (required when remote node is set)',
            prompt: 'Project used to construct repository URL (e.g. platform/frameworks/base).',
            value: settings.defaultProject,
            ignoreFocusOut: true
          })
        : undefined
      if (remoteNodeId && !projectForRemote) return

      const client = await getClient(context)
      log(`Submitting uploadId=${uploadId} branch=${branch}`)

      const submitResp = await client.submit({
        uploadId,
        subject,
        description: description || '',
        branch,
        remoteNodeId: remoteNodeId || undefined,
        project: projectForRemote || undefined
      })

      if (!submitResp.success) {
        log(`Submit failed: ${submitResp.error}`)
        vscode.window.showErrorMessage(`PatchX submit failed: ${submitResp.error}`)
        return
      }

      const submissionId = submitResp.data.submissionId
      await context.globalState.update(STATE_LAST_UPLOAD_ID, uploadId)
      await context.globalState.update(STATE_LAST_SUBMISSION_ID, submissionId)
      log(`Submit accepted. submissionId=${submissionId}`)
      vscode.window.showInformationMessage(`PatchX submission started (submissionId: ${submissionId})`)

      await pollStatus({
        context,
        output,
        submissionId,
        pollIntervalMs: settings.pollIntervalMs,
        autoOpenChangeUrl: settings.autoOpenChangeUrl
      })
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.uploadAndSubmit', async () => {
      await vscode.commands.executeCommand('patchx.uploadPatchFile')
      await vscode.commands.executeCommand('patchx.submitLastUpload')
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.checkStatus', async () => {
      const lastSubmissionId = context.globalState.get<string>(STATE_LAST_SUBMISSION_ID) || ''
      const submissionId = await vscode.window.showInputBox({
        title: 'Submission ID',
        prompt: 'Submission ID from /api/submit response.',
        value: lastSubmissionId,
        ignoreFocusOut: true
      })
      if (!submissionId) return

      const client = await getClient(context)
      log(`Checking status: submissionId=${submissionId}`)
      const resp = await client.status(submissionId)

      if (!resp.success) {
        log(`Status failed: ${resp.error}`)
        vscode.window.showErrorMessage(`PatchX status failed: ${resp.error}`)
        return
      }

      await context.globalState.update(STATE_LAST_SUBMISSION_ID, submissionId)
      const { status, changeUrl, error } = resp.data
      log(`Status: ${status}${changeUrl ? ` changeUrl=${changeUrl}` : ''}${error ? ` error=${error}` : ''}`)

      if (changeUrl) {
        const action = await vscode.window.showInformationMessage(
          `PatchX status: ${status}`,
          'Open Change'
        )
        if (action === 'Open Change') {
          await vscode.env.openExternal(vscode.Uri.parse(changeUrl))
        }
      } else {
        vscode.window.showInformationMessage(`PatchX status: ${status}`)
      }
    })
  )
}

async function pollStatus(opts: {
  context: vscode.ExtensionContext
  output: vscode.OutputChannel
  submissionId: string
  pollIntervalMs: number
  autoOpenChangeUrl: boolean
}) {
  const { context, output, submissionId, pollIntervalMs, autoOpenChangeUrl } = opts

  const log = (msg: string) => output.appendLine(`[${new Date().toISOString()}] ${msg}`)

  const client = await getClient(context)
  const endAt = Date.now() + 15 * 60 * 1000

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: `PatchX: Waiting for submission ${submissionId}`
    },
    async (_progress, token) => {
      while (!token.isCancellationRequested && Date.now() < endAt) {
        const resp = await client.status(submissionId)
        if (!resp.success) {
          log(`Status poll failed: ${resp.error}`)
          vscode.window.showErrorMessage(`PatchX status poll failed: ${resp.error}`)
          return
        }

        const status = resp.data.status
        const changeUrl = resp.data.changeUrl
        const err = resp.data.error
        log(`Polled status: ${status}${changeUrl ? ` changeUrl=${changeUrl}` : ''}`)

        if (status !== 'processing' && status !== 'pending' && status !== 'running') {
          if (status === 'completed' && changeUrl) {
            if (autoOpenChangeUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(changeUrl))
            } else {
              const action = await vscode.window.showInformationMessage(
                `PatchX completed.`,
                'Open Change'
              )
              if (action === 'Open Change') {
                await vscode.env.openExternal(vscode.Uri.parse(changeUrl))
              }
            }
          } else if (status === 'failed') {
            vscode.window.showErrorMessage(`PatchX failed: ${err || 'unknown error'}`)
          } else {
            vscode.window.showInformationMessage(`PatchX status: ${status}`)
          }
          return
        }

        await sleep(pollIntervalMs)
      }

      if (token.isCancellationRequested) {
        vscode.window.showInformationMessage('PatchX: status polling cancelled.')
      } else {
        vscode.window.showWarningMessage('PatchX: status polling timed out (15 minutes).')
      }
    }
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}


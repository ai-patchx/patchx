import * as vscode from 'vscode'
import { PatchxClient } from './patchxClient'

const SECRET_AUTH_TOKEN = 'patchx.authToken'
const STATE_LAST_UPLOAD_ID = 'patchx.lastUploadId'
const STATE_LAST_SUBMISSION_ID = 'patchx.lastSubmissionId'

function getSettings() {
  const cfg = vscode.workspace.getConfiguration('patchx')
  const baseUrl = (cfg.get<string>('baseUrl') || 'https://patchx-service.angersax.workers.dev').trim()
  const defaultProject = (cfg.get<string>('defaultProject') || '').trim()
  const defaultBranch = (cfg.get<string>('defaultBranch') || 'refs/heads/main').trim()
  const defaultRemoteNodeId = (cfg.get<string>('defaultRemoteNodeId') || '').trim()
  const patchFilePath = (cfg.get<string>('patchFilePath') || '').trim()
  const commitSubject = (cfg.get<string>('commitSubject') || '').trim()
  const detailedDescription = (cfg.get<string>('detailedDescription') || '').trim()
  const authorName = (cfg.get<string>('authorName') || '').trim()
  const authorEmail = (cfg.get<string>('authorEmail') || '').trim()
  const emailNotifications = (cfg.get<string>('emailNotifications') || '').trim()
  const pollIntervalMs = Math.max(500, cfg.get<number>('pollIntervalMs') ?? 2000)
  const autoOpenChangeUrl = cfg.get<boolean>('autoOpenChangeUrl') ?? true

  return {
    baseUrl,
    defaultProject,
    defaultBranch,
    defaultRemoteNodeId,
    patchFilePath,
    commitSubject,
    detailedDescription,
    authorName,
    authorEmail,
    emailNotifications,
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

const PICK_NONE = ''
const PICK_CUSTOM = '__custom__'

type NodeItem = { id: string; name?: string }

async function pickRemoteNodeId(
  client: PatchxClient,
  currentValue: string
): Promise<string | undefined> {
  const items: { label: string; id: string }[] = [
    { label: 'None', id: PICK_NONE },
    { label: 'Enter custom ID...', id: PICK_CUSTOM }
  ]
  let nodes: NodeItem[] = []
  try {
    const res = await client.getNodes()
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      nodes = res.data
      for (const n of nodes) {
        items.splice(items.length - 1, 0, {
          label: n.name ? `${n.name} (${n.id})` : n.id,
          id: n.id
        })
      }
    }
  } catch {
    // Fall back to custom only
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Remote Node (optional)',
    placeHolder: 'Select a node for /api/submit or None to skip.',
    matchOnDescription: true,
    ignoreFocusOut: true
  })
  if (picked === undefined) return undefined
  if (picked.id === PICK_CUSTOM) {
    const custom = (await vscode.window.showInputBox({
      title: 'Remote Node ID',
      prompt: 'Enter node id for /api/submit.',
      value: currentValue || '',
      ignoreFocusOut: true
    }))?.trim()
    return custom === undefined ? undefined : custom
  }
  return picked.id === PICK_NONE ? '' : picked.id
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type PatchxSettingsViewState = {
  hasAuth: boolean
  branch: string
  project: string
  remoteNodeId: string
  patchFilePath: string
  commitSubject: string
  detailedDescription: string
  authorName: string
  authorEmail: string
  emailNotifications: string
}

function getPatchxSettingsHtml(state: PatchxSettingsViewState): string {
  const authLabel = state.hasAuth ? 'Sign out' : 'Login'
  const branchEsc = escapeHtml(state.branch)
  const projectEsc = escapeHtml(state.project)
  const remoteJson = JSON.stringify(state.remoteNodeId)
  const patchFileEsc = escapeHtml(state.patchFilePath)
  const commitSubjectEsc = escapeHtml(state.commitSubject)
  const descriptionEsc = escapeHtml(state.detailedDescription)
  const authorNameEsc = escapeHtml(state.authorName)
  const authorEmailEsc = escapeHtml(state.authorEmail)
  const emailNotifEsc = escapeHtml(state.emailNotifications)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { padding: 12px; font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); }
    label { display: block; margin-top: 10px; margin-bottom: 4px; font-weight: 500; }
    input, select, textarea { width: 100%; padding: 6px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
    textarea { min-height: 48px; resize: vertical; }
    .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    .row { display: flex; gap: 6px; align-items: center; }
    .row input { flex: 1; }
    .auth-row { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
    button.btn-primary {
      padding: 4px 8px;
      font-size: 12px;
      white-space: nowrap;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    button.btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    </style>
</head>
<body>
  <div class="auth-row">
    <button id="btn-auth-toggle" class="btn-primary">${authLabel}</button>
  </div>
  <div class="hint" style="margin-top: 0;">Sign in to PatchX service or clear stored token.</div>

  <label for="patch-file">Patch File</label>
  <div class="row">
    <input id="patch-file" type="text" value="${patchFileEsc}" placeholder="Path to .patch or .diff file" />
    <button id="patch-browse" class="btn-primary">Browse</button>
  </div>
  <div class="hint">File to upload via /api/upload</div>

  <label for="target-project">Target Project</label>
  <input id="target-project" type="text" value="${projectEsc}" placeholder="e.g. platform/frameworks/base" />
  <div class="hint">Default project for /api/upload</div>

  <label for="target-branch">Target Branch</label>
  <input id="target-branch" type="text" value="${branchEsc}" placeholder="refs/heads/main" />
  <div class="hint">Gerrit target ref for /api/submit</div>

  <label for="remote-node">Remote Node</label>
  <select id="remote-node">
    <option value="">None</option>
  </select>
  <div class="hint">Optional node for /api/submit (pick from list)</div>

  <label for="commit-subject">Commit Subject</label>
  <input id="commit-subject" type="text" value="${commitSubjectEsc}" placeholder="Short one-line summary" />
  <div class="hint">Required for /api/submit</div>

  <label for="detailed-description">Detailed Description</label>
  <textarea id="detailed-description" placeholder="Optional multi-line description">${descriptionEsc}</textarea>

  <label for="author-name">Author Name</label>
  <input id="author-name" type="text" value="${authorNameEsc}" placeholder="Your name" />

  <label for="author-email">Author Email</label>
  <input id="author-email" type="text" value="${authorEmailEsc}" placeholder="your@email.com" />

  <label for="email-notifications">Email Notifications</label>
  <input id="email-notifications" type="text" value="${emailNotifEsc}" placeholder="e.g. comma-separated emails" />
  <div class="hint">Email notifications for submission</div>

  <div class="auth-row" style="margin-top: 16px;">
    <button id="btn-upload" class="btn-primary">Upload</button>
    <button id="btn-submit" class="btn-primary">Submit</button>
    <button id="btn-upload-submit" class="btn-primary">Upload & Submit</button>
    <button id="btn-status" class="btn-primary">Check Status</button>
  </div>
  <div class="hint" style="margin-top: 0;">Upload patch file, submit last upload, or check submission status.</div>

  <script>
    const vscode = acquireVsCodeApi();
    const branchEl = document.getElementById('target-branch');
    const projectEl = document.getElementById('target-project');
    const nodeEl = document.getElementById('remote-node');
    const patchFileEl = document.getElementById('patch-file');
    const commitSubjectEl = document.getElementById('commit-subject');
    const descriptionEl = document.getElementById('detailed-description');
    const authorNameEl = document.getElementById('author-name');
    const authorEmailEl = document.getElementById('author-email');
    const emailNotifEl = document.getElementById('email-notifications');

    const initialRemoteId = ${remoteJson};
    let isLoggedIn = ${state.hasAuth};
    const authBtn = document.getElementById('btn-auth-toggle');

    function updateAuthButton() {
      authBtn.textContent = isLoggedIn ? 'Sign out' : 'Login';
    }

    function save() {
      vscode.postMessage({
        type: 'update',
        branch: branchEl.value.trim(),
        project: projectEl.value.trim(),
        remoteNodeId: nodeEl.value.trim(),
        patchFilePath: patchFileEl.value.trim(),
        commitSubject: commitSubjectEl.value.trim(),
        detailedDescription: descriptionEl.value.trim(),
        authorName: authorNameEl.value.trim(),
        authorEmail: authorEmailEl.value.trim(),
        emailNotifications: emailNotifEl.value.trim()
      });
    }
    branchEl.addEventListener('change', save);
    branchEl.addEventListener('blur', save);
    projectEl.addEventListener('change', save);
    projectEl.addEventListener('blur', save);
    nodeEl.addEventListener('change', save);
    patchFileEl.addEventListener('change', save);
    patchFileEl.addEventListener('blur', save);
    commitSubjectEl.addEventListener('change', save);
    commitSubjectEl.addEventListener('blur', save);
    descriptionEl.addEventListener('change', save);
    descriptionEl.addEventListener('blur', save);
    authorNameEl.addEventListener('change', save);
    authorNameEl.addEventListener('blur', save);
    authorEmailEl.addEventListener('change', save);
    authorEmailEl.addEventListener('blur', save);
    emailNotifEl.addEventListener('change', save);

    document.getElementById('patch-browse').addEventListener('click', () => vscode.postMessage({ type: 'pickFile' }));
    authBtn.addEventListener('click', () => {
      vscode.postMessage({ type: isLoggedIn ? 'logout' : 'login' });
      if (isLoggedIn) {
        isLoggedIn = false;
        updateAuthButton();
      }
    });
    document.getElementById('btn-upload').addEventListener('click', () => vscode.postMessage({ type: 'upload' }));
    document.getElementById('btn-submit').addEventListener('click', () => vscode.postMessage({ type: 'submit' }));
    document.getElementById('btn-upload-submit').addEventListener('click', () => vscode.postMessage({ type: 'uploadSubmit' }));
    document.getElementById('btn-status').addEventListener('click', () => vscode.postMessage({ type: 'checkStatus' }));

    window.addEventListener('message', e => {
      const m = e.data;
      if (m.type === 'nodes') {
        nodeEl.innerHTML = '<option value="">None</option>';
        (m.nodes || []).forEach(n => {
          const opt = document.createElement('option');
          opt.value = n.id;
          opt.textContent = (n.name && n.name.trim()) ? n.name.trim() : n.id;
          opt.title = n.id;
          if (n.id === initialRemoteId) opt.selected = true;
          nodeEl.appendChild(opt);
        });
        if (initialRemoteId && !nodeEl.value) {
          const custom = document.createElement('option');
          custom.value = initialRemoteId;
          custom.textContent = initialRemoteId + ' (custom)';
          custom.selected = true;
          nodeEl.appendChild(custom);
        }
      }
      if (m.type === 'patchFilePath') {
        patchFileEl.value = m.path || '';
        save();
      }
      if (m.type === 'init') {
        branchEl.value = m.branch || '';
        projectEl.value = m.project || '';
        nodeEl.value = m.remoteNodeId || '';
        patchFileEl.value = m.patchFilePath || '';
        commitSubjectEl.value = m.commitSubject || '';
        descriptionEl.value = m.detailedDescription || '';
        authorNameEl.value = m.authorName || '';
        authorEmailEl.value = m.authorEmail || '';
        emailNotifEl.value = m.emailNotifications || '';
      }
      if (m.type === 'authState') {
        isLoggedIn = m.hasAuth === true;
        updateAuthButton();
      }
    });
  </script>
</body>
</html>`
}

class PatchxSettingsViewProvider implements vscode.WebviewViewProvider {
  private webviewView: vscode.WebviewView | undefined

  constructor(
    private readonly ctx: vscode.ExtensionContext
  ) {}

  async updateAuthState(): Promise<void> {
    const token = await this.ctx.secrets.get(SECRET_AUTH_TOKEN)
    this.webviewView?.webview.postMessage({ type: 'authState', hasAuth: !!token })
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.webviewView = webviewView
    webviewView.onDidDispose(() => { this.webviewView = undefined })
    webviewView.webview.options = { enableScripts: true }
    const settings = getSettings()
    const state: PatchxSettingsViewState = {
      hasAuth: false,
      branch: settings.defaultBranch,
      project: settings.defaultProject,
      remoteNodeId: settings.defaultRemoteNodeId,
      patchFilePath: settings.patchFilePath,
      commitSubject: settings.commitSubject,
      detailedDescription: settings.detailedDescription,
      authorName: settings.authorName,
      authorEmail: settings.authorEmail,
      emailNotifications: settings.emailNotifications
    }
    return (async () => {
      state.hasAuth = !!(await this.ctx.secrets.get(SECRET_AUTH_TOKEN))
      webviewView.webview.html = getPatchxSettingsHtml(state)
    const cfg = vscode.workspace.getConfiguration('patchx')
    webviewView.webview.onDidReceiveMessage(async (msg: {
      type: string
      branch?: string
      project?: string
      remoteNodeId?: string
      patchFilePath?: string
      commitSubject?: string
      detailedDescription?: string
      authorName?: string
      authorEmail?: string
      emailNotifications?: string
    }) => {
      if (msg.type === 'pickFile') {
        const picked = await vscode.window.showOpenDialog({
          title: 'Select a patch file to upload',
          canSelectMany: false,
          filters: { 'Patch files': ['patch', 'diff'], 'All files': ['*'] }
        })
        if (picked?.[0]) {
          webviewView.webview.postMessage({ type: 'patchFilePath', path: picked[0].fsPath })
        }
        return
      }
      if (msg.type === 'login') {
        await vscode.commands.executeCommand('patchx.login')
        return
      }
      if (msg.type === 'logout') {
        await vscode.commands.executeCommand('patchx.clearAuthToken')
        return
      }
      if (msg.type === 'upload') {
        await vscode.commands.executeCommand('patchx.uploadPatchFile')
        return
      }
      if (msg.type === 'submit') {
        await vscode.commands.executeCommand('patchx.submitLastUpload')
        return
      }
      if (msg.type === 'uploadSubmit') {
        await vscode.commands.executeCommand('patchx.uploadAndSubmit')
        return
      }
      if (msg.type === 'checkStatus') {
        await vscode.commands.executeCommand('patchx.checkStatus')
        return
      }
      if (msg.type === 'update') {
        if (msg.branch !== undefined) await cfg.update('defaultBranch', msg.branch, vscode.ConfigurationTarget.Global)
        if (msg.project !== undefined) await cfg.update('defaultProject', msg.project, vscode.ConfigurationTarget.Global)
        if (msg.remoteNodeId !== undefined) await cfg.update('defaultRemoteNodeId', msg.remoteNodeId, vscode.ConfigurationTarget.Global)
        if (msg.patchFilePath !== undefined) await cfg.update('patchFilePath', msg.patchFilePath, vscode.ConfigurationTarget.Global)
        if (msg.commitSubject !== undefined) await cfg.update('commitSubject', msg.commitSubject, vscode.ConfigurationTarget.Global)
        if (msg.detailedDescription !== undefined) await cfg.update('detailedDescription', msg.detailedDescription, vscode.ConfigurationTarget.Global)
        if (msg.authorName !== undefined) await cfg.update('authorName', msg.authorName, vscode.ConfigurationTarget.Global)
        if (msg.authorEmail !== undefined) await cfg.update('authorEmail', msg.authorEmail, vscode.ConfigurationTarget.Global)
        if (msg.emailNotifications !== undefined) await cfg.update('emailNotifications', String(msg.emailNotifications), vscode.ConfigurationTarget.Global)
      }
    })
    // Load nodes and send to webview
    getClient(this.ctx)
      .then((client) => client.getNodes())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          webviewView.webview.postMessage({ type: 'nodes', nodes: res.data })
        }
      })
      .catch(() => {})
    })()
  }
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('PatchX')

  const log = (msg: string) => {
    output.appendLine(`[${new Date().toISOString()}] ${msg}`)
    output.show(true)
  }

  context.subscriptions.push(output)

  const settingsViewProvider = new PatchxSettingsViewProvider(context)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('patchx.settingsView', settingsViewProvider)
  )

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
        await settingsViewProvider.updateAuthState()
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
      await settingsViewProvider.updateAuthState()
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.setDefaultRemoteNode', async () => {
      const client = await getClient(context)
      const settings = getSettings()
      const picked = await pickRemoteNodeId(client, settings.defaultRemoteNodeId)
      if (picked === undefined) return
      await vscode.workspace.getConfiguration('patchx').update('defaultRemoteNodeId', picked, vscode.ConfigurationTarget.Global)
      vscode.window.showInformationMessage(
        picked ? `PatchX default remote node set to: ${picked}` : 'PatchX default remote node cleared.'
      )
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('patchx.uploadPatchFile', async () => {
      const settings = getSettings()
      const defaultUri = settings.patchFilePath
        ? vscode.Uri.file(settings.patchFilePath)
        : undefined
      const picked = await vscode.window.showOpenDialog({
        title: 'Select a patch file to upload',
        canSelectMany: false,
        defaultUri,
        filters: {
          'Patch files': ['patch', 'diff'],
          'All files': ['*']
        }
      })
      if (!picked?.[0]) return
      await vscode.workspace.getConfiguration('patchx').update('patchFilePath', picked[0].fsPath, vscode.ConfigurationTarget.Global)

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
        value: settings.commitSubject,
        ignoreFocusOut: true
      })
      if (!subject) return

      const description = await vscode.window.showInputBox({
        title: 'Detailed Description',
        prompt: 'Optional.',
        value: settings.detailedDescription,
        ignoreFocusOut: true
      })
      if (description === undefined) return

      const branch = await vscode.window.showInputBox({
        title: 'Target Branch',
        prompt: 'Gerrit target ref (e.g. refs/heads/main).',
        value: settings.defaultBranch,
        ignoreFocusOut: true
      })
      if (!branch) return

      const client = await getClient(context)
      const remoteNodeId = await pickRemoteNodeId(client, settings.defaultRemoteNodeId)
      if (remoteNodeId === undefined) return

      const projectForRemote = remoteNodeId
        ? await vscode.window.showInputBox({
            title: 'Target Project (required when remote node is set)',
            prompt: 'Project used to construct repository URL (e.g. platform/frameworks/base).',
            value: settings.defaultProject,
            ignoreFocusOut: true
          })
        : undefined
      if (remoteNodeId && !projectForRemote) return

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


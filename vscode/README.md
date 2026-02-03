# PatchX

A VS Code extension that streamlines contributing code to the Android Open Source Project (AOSP), with AI‑driven patch conflict resolution.

It integrates with the PatchX service (upload → submit → status):
- `POST /api/auth/login`
- `POST /api/upload` (`multipart/form-data`)
- `POST /api/submit` (`application/json`)
- `GET /api/status/<submissionId>`

## Sidebar

Click the **PatchX** icon in the Activity Bar to open the PatchX sidebar. The **Targets** view shows:

- **Login** / **Sign out** — One button that toggles: sign in to the PatchX service (username/password via prompt) or clear the stored auth token.
- **Patch File** — Path to the patch file to upload; use **Browse** to pick a file (saved as `patchx.patchFilePath`).
- **Target Project** — Default project for /api/upload (saved as `patchx.defaultProject`).
- **Target Branch** — Gerrit target ref for /api/submit (saved as `patchx.defaultBranch`).
- **Remote Node** — Optional node for /api/submit; list shows node names (e.g. `ubuntu-24.04-us-aliyun`) from the API (saved as `patchx.defaultRemoteNodeId`).
- **Commit Subject** — Default one-line subject for /api/submit (saved as `patchx.commitSubject`).
- **Detailed Description** — Default multi-line description for /api/submit (saved as `patchx.detailedDescription`).
- **Author Name** — Author name for submission (saved as `patchx.authorName`).
- **Author Email** — Author email for submission (saved as `patchx.authorEmail`).
- **Email Notifications** — Text input for email notifications (e.g. comma-separated emails) (saved as `patchx.emailNotifications`).
- **Upload** / **Submit** / **Upload & Submit** / **Check Status** — Actions to upload a patch file, submit the last upload, upload then submit in one step, or check submission status.

Changes are saved to your settings as you edit. All PatchX actions are available from the sidebar only (no Command Palette commands).

## Configuration

In VS Code settings (search for **PatchX**). Settings appear in this order:

| Setting | Description |
|--------|-------------|
| **`patchx.baseUrl`** | PatchX Worker base URL (no trailing slash). Default: `https://patchx-service.angersax.workers.dev` |
| **`patchx.patchFilePath`** | Path to patch file for upload (used by sidebar and Upload). Default: empty. |
| **`patchx.defaultProject`** | Default project name for /api/upload (e.g. `platform/frameworks/base`). Default: empty. |
| **`patchx.defaultBranch`** | Default branch for /api/submit. Default: `refs/heads/main` |
| **`patchx.defaultRemoteNodeId`** | Optional default remote node id for /api/submit. Pick from the Remote Node list in the sidebar (shows node names). |
| **`patchx.commitSubject`** | Default commit subject for /api/submit. Default: empty. |
| **`patchx.detailedDescription`** | Default detailed description for /api/submit. Default: empty. |
| **`patchx.authorName`** | Author name for patch submission. Default: empty. |
| **`patchx.authorEmail`** | Author email for patch submission. Default: empty. |
| **`patchx.emailNotifications`** | Email notifications for submission (e.g. comma-separated emails). Default: empty. |
| **`patchx.pollIntervalMs`** | Polling interval for /api/status/<submissionId>. Default: 2000, minimum: 500. |
| **`patchx.autoOpenChangeUrl`** | Auto-open Gerrit change URL when submission completes. Default: true. |

## Development

1. Open the `vscode` folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Press **F5** to run the extension (uses `.vscode/launch.json`).

Logs appear in the **Output** panel → **PatchX** channel.

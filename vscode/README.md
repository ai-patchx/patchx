# PatchX VS Code Extension

This VS Code extension lets you configure and run **PatchX** by invoking the **PatchX Cloudflare Worker REST API** (upload → submit → status).

It is intended to follow the general layout/pattern of a typical VS Code extension, but calls PatchX endpoints:
- `POST /api/auth/login`
- `POST /api/upload` (`multipart/form-data`)
- `POST /api/submit` (`application/json`)
- `GET /api/status/<submissionId>`

## Configuration

VS Code Settings:
- **`patchx.baseUrl`**: PatchX Worker base URL (default: `https://patchx-service.angersax.workers.dev`)
- **`patchx.defaultProject`**: default `project` for uploads (e.g. `platform/frameworks/base`)
- **`patchx.defaultBranch`**: default branch for submit (default: `refs/heads/master`)
- **`patchx.defaultRemoteNodeId`**: optional; enables remote node submit flow (requires project)
- **`patchx.pollIntervalMs`**: status polling interval
- **`patchx.autoOpenChangeUrl`**: open Gerrit URL when completed

## Commands

Open Command Palette and run:
- **PatchX: Login (Get Auth Token)** (`patchx.login`)
- **PatchX: Upload Patch File** (`patchx.uploadPatchFile`)
- **PatchX: Submit Last Upload** (`patchx.submitLastUpload`)
- **PatchX: Upload and Submit** (`patchx.uploadAndSubmit`)
- **PatchX: Check Submission Status** (`patchx.checkStatus`)
- **PatchX: Set Auth Token** (`patchx.setAuthToken`)
- **PatchX: Clear Auth Token** (`patchx.clearAuthToken`)

## Development / Run locally

1. Open folder `vscode/extension` in VS Code.
2. Install dependencies:

```powershell
npm install
```

3. Press **F5** to run the extension (uses `.vscode/launch.json`).

The extension writes logs to the **Output** panel → **PatchX** channel.


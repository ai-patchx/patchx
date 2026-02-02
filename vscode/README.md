# PatchX

A VS Code extension that streamlines contributing code to the Android Open Source Project (AOSP), with AI‑driven patch conflict resolution.

It integrates with the PatchX service (upload → submit → status):
- `POST /api/auth/login`
- `POST /api/upload` (`multipart/form-data`)
- `POST /api/submit` (`application/json`)
- `GET /api/status/<submissionId>`

## Configuration

In VS Code settings (search for **PatchX**):

| Setting | Description |
|--------|-------------|
| **`patchx.baseUrl`** | PatchX Worker base URL (no trailing slash). Default: `https://patchx-service.angersax.workers.dev` |
| **`patchx.defaultProject`** | Default project name for /api/upload (e.g. `platform/frameworks/base`). |
| **`patchx.defaultBranch`** | Default branch for /api/submit. Default: `refs/heads/main` |
| **`patchx.defaultRemoteNodeId`** | Optional default remote node id for /api/submit. Use command "PatchX: Set Default Remote Node" to pick from the API node list. |
| **`patchx.pollIntervalMs`** | Polling interval for /api/status/<submissionId>. Default: 2000, minimum: 500 |
| **`patchx.autoOpenChangeUrl`** | Auto-open Gerrit change URL when submission completes. Default: true |

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

- **PatchX: Upload Patch File** — upload a patch file
- **PatchX: Submit Last Upload** — submit the last upload
- **PatchX: Upload and Submit** — upload then submit in one step
- **PatchX: Check Submission Status** — check status of a submission
- **PatchX: Login (Get Auth Token)** — sign in and store auth token
- **PatchX: Set Auth Token** — set auth token manually
- **PatchX: Clear Auth Token** — clear stored auth token

## Development

1. Open the `vscode` folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Press **F5** to run the extension (uses `.vscode/launch.json`).

Logs appear in the **Output** panel → **PatchX** channel.

# PatchX VS Code 扩展（中文）

本 VS Code 扩展通过调用 **PatchX Cloudflare Worker REST API** 来配置并运行 **PatchX**，完成「上传补丁 → 提交 → 查询状态」的完整流程。

扩展整体结构参考了常见 VS Code 扩展的模式，但具体调用的是 PatchX 的以下接口：
- `POST /api/auth/login`
- `POST /api/upload`（`multipart/form-data`）
- `POST /api/submit`（`application/json`）
- `GET /api/status/<submissionId>`

## 配置项

在 VS Code 设置中搜索 `PatchX`，或直接编辑 `settings.json`，可配置以下选项：

- **`patchx.baseUrl`**：PatchX Worker 的基础 URL（默认：`https://patchx-service.angersax.workers.dev`），末尾不要加 `/`
- **`patchx.defaultProject`**：上传补丁时 `project` 字段的默认值（例如：`platform/frameworks/base`）
- **`patchx.defaultBranch`**：提交时的默认分支（默认：`refs/heads/master`）
- **`patchx.defaultRemoteNodeId`**：可选；设置后会启用远程节点提交流程（此时必须同时提供 `project`）
- **`patchx.pollIntervalMs`**：轮询 `GET /api/status/<submissionId>` 的时间间隔（毫秒）
- **`patchx.autoOpenChangeUrl`**：提交完成后是否自动打开 Gerrit 变更链接

## 可用命令

在 VS Code 中打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`），运行以下命令：

- **PatchX: Login (Get Auth Token)**（`patchx.login`）：调用 `/api/auth/login`，并将返回的 token 安全保存到 VS Code Secret Storage 中
- **PatchX: Upload Patch File**（`patchx.uploadPatchFile`）：选择本地 `.patch` / `.diff` 文件并调用 `/api/upload`
- **PatchX: Submit Last Upload**（`patchx.submitLastUpload`）：基于上一次上传得到的 `uploadId` 调用 `/api/submit`，并自动开始轮询状态
- **PatchX: Upload and Submit**（`patchx.uploadAndSubmit`）：先上传补丁再立即提交的便捷组合命令
- **PatchX: Check Submission Status**（`patchx.checkStatus`）：手动查询 `/api/status/<submissionId>`
- **PatchX: Set Auth Token**（`patchx.setAuthToken`）：手动设置认证 token（直接保存为 `Authorization: Bearer <token>` 或原始值）
- **PatchX: Clear Auth Token**（`patchx.clearAuthToken`）：清除已保存的认证 token

扩展的日志输出在 VS Code **“输出 (Output)” 面板 → “PatchX”** 渠道中查看。

## 本地开发与运行

1. 在 VS Code 中打开目录 `vscode`（当前扩展所在目录）。
2. 在终端中安装依赖：

```powershell
npm install
```

3. 安装完成后，执行：
   - 按 **F5** 启动扩展调试会话（使用 `.vscode/launch.json` 配置）；
   - 会启动一个新的 Extension Host 窗口，用于测试 PatchX 扩展。

4. 在调试窗口中：
   - 先在设置中配置 `patchx.baseUrl` 等参数；
   - 然后通过命令面板运行上文列出的 PatchX 命令，即可通过 Cloudflare Worker REST API 直接在 VS Code 中上传、提交补丁并查看状态。


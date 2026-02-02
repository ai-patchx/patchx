# PatchX（中文）

简化向 Android 开源项目 (AOSP) 贡献代码的 VS Code 扩展，支持 AI 驱动的补丁冲突解决。

通过 PatchX 服务完成「上传补丁 → 提交 → 查询状态」流程，涉及的接口包括：
- `POST /api/auth/login`
- `POST /api/upload`（`multipart/form-data`）
- `POST /api/submit`（`application/json`）
- `GET /api/status/<submissionId>`

## 配置项

在 VS Code 设置中搜索 **PatchX**，可配置：

| 配置项 | 说明 |
|--------|------|
| **`patchx.baseUrl`** | PatchX Worker 基础 URL，末尾不要加 `/`。默认：`https://patchx-service.angersax.workers.dev` |
| **`patchx.defaultProject`** | 用于 /api/upload 的默认项目名（如 `platform/frameworks/base`）。 |
| **`patchx.defaultBranch`** | 用于 /api/submit 的默认分支。默认：`refs/heads/main` |
| **`patchx.defaultRemoteNodeId`** | 可选，用于 /api/submit 的默认远程节点 id。可用命令「PatchX: Set Default Remote Node」从 API 节点列表中选择。 |
| **`patchx.pollIntervalMs`** | 轮询 /api/status/<submissionId> 的间隔（毫秒）。默认：2000，最小值：500 |
| **`patchx.autoOpenChangeUrl`** | 提交完成后是否自动打开 Gerrit 变更链接。默认：true |

## 命令

在 VS Code 中打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`），可运行：

- **PatchX: Upload Patch File** — 上传补丁文件
- **PatchX: Submit Last Upload** — 提交最近一次上传
- **PatchX: Upload and Submit** — 上传并提交（一步完成）
- **PatchX: Check Submission Status** — 查看提交状态
- **PatchX: Login (Get Auth Token)** — 登录并保存认证 token
- **PatchX: Set Auth Token** — 手动设置认证 token
- **PatchX: Clear Auth Token** — 清除已保存的认证 token

## 本地开发

1. 在 VS Code 中打开 `vscode` 目录。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 按 **F5** 启动扩展调试（使用 `.vscode/launch.json`）。

扩展日志在 **输出 (Output)** 面板 → **PatchX** 渠道中查看。

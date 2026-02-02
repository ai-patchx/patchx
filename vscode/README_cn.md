# PatchX（中文）

简化向 Android 开源项目 (AOSP) 贡献代码的 VS Code 扩展，支持 AI 驱动的补丁冲突解决。

通过 PatchX 服务完成「上传补丁 → 提交 → 查询状态」流程，涉及的接口包括：
- `POST /api/auth/login`
- `POST /api/upload`（`multipart/form-data`）
- `POST /api/submit`（`application/json`）
- `GET /api/status/<submissionId>`

## 侧边栏

点击活动栏中的 **PatchX** 图标可打开 PatchX 侧边栏。**Targets** 视图中可编辑：

- **Login** / **Logout** — 登录 PatchX 服务（通过提示输入用户名/密码）或清除已保存的认证 token。
- **Patch File（补丁文件）** — 要上传的补丁文件路径；点击 **Browse** 选择文件，对应设置 `patchx.patchFilePath`。
- **Target Project（目标项目）** — 用于 /api/upload 的默认项目，对应设置 `patchx.defaultProject`。
- **Target Branch（目标分支）** — 用于 /api/submit 的 Gerrit 目标 ref，对应设置 `patchx.defaultBranch`。
- **Remote Node（远程节点）** — 可选，用于 /api/submit 的节点；列表显示 API 返回的节点名称（如 `ubuntu-24.04-us-aliyun`），对应设置 `patchx.defaultRemoteNodeId`。
- **Commit Subject（提交主题）** — 用于 /api/submit 的默认单行主题，对应设置 `patchx.commitSubject`。
- **Detailed Description（详细描述）** — 用于 /api/submit 的默认多行描述，对应设置 `patchx.detailedDescription`。
- **Author Name（作者姓名）** — 提交时的作者姓名，对应设置 `patchx.authorName`。
- **Author Email（作者邮箱）** — 提交时的作者邮箱，对应设置 `patchx.authorEmail`。
- **Email Notifications（邮件通知）** — 文本输入，填写邮件通知（如逗号分隔的邮箱），对应设置 `patchx.emailNotifications`。
- **Upload** / **Submit** / **Upload & Submit** / **Check Status** — 上传补丁文件、提交最近一次上传、上传并提交、或查看提交状态。

编辑后会自动保存到设置。所有 PatchX 操作均在侧边栏完成（无需使用命令面板）。

## 配置项

在 VS Code 设置中搜索 **PatchX**，可配置。配置项按以下顺序显示：

| 配置项 | 说明 |
|--------|------|
| **`patchx.baseUrl`** | PatchX Worker 基础 URL，末尾不要加 `/`。默认：`https://patchx-service.angersax.workers.dev` |
| **`patchx.patchFilePath`** | 要上传的补丁文件路径（侧边栏与上传使用）。默认：空。 |
| **`patchx.defaultProject`** | 用于 /api/upload 的默认项目名（如 `platform/frameworks/base`）。默认：空。 |
| **`patchx.defaultBranch`** | 用于 /api/submit 的默认分支。默认：`refs/heads/main` |
| **`patchx.defaultRemoteNodeId`** | 可选，用于 /api/submit 的默认远程节点 id。在侧边栏 Remote Node 列表中选择（显示节点名称）。 |
| **`patchx.commitSubject`** | 用于 /api/submit 的默认提交主题。默认：空。 |
| **`patchx.detailedDescription`** | 用于 /api/submit 的默认详细描述。默认：空。 |
| **`patchx.authorName`** | 补丁提交时的作者姓名。默认：空。 |
| **`patchx.authorEmail`** | 补丁提交时的作者邮箱。默认：空。 |
| **`patchx.emailNotifications`** | 提交的邮件通知（如逗号分隔的邮箱）。默认：空。 |
| **`patchx.pollIntervalMs`** | 轮询 /api/status/<submissionId> 的间隔（毫秒）。默认：2000，最小值：500。 |
| **`patchx.autoOpenChangeUrl`** | 提交完成后是否自动打开 Gerrit 变更链接。默认：true。 |

## 本地开发

1. 在 VS Code 中打开 `vscode` 目录。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 按 **F5** 启动扩展调试（使用 `.vscode/launch.json`）。

扩展日志在 **输出 (Output)** 面板 → **PatchX** 渠道中查看。

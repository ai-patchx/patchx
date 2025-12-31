import { Env, Submission } from '../types'
import { getKvNamespace, KVLike } from '../kv'
import { generateId } from '../utils'
import { UploadService } from './uploadService'
import { GerritService } from './gerritService'
import { EmailService } from './emailService'
import { GitService } from './gitService'

export class SubmissionService {
  private env: Env
  private uploadService: UploadService
  private gerritService: GerritService
  private emailService: EmailService
  private gitService: GitService
  private kv: KVLike

  constructor(env: Env) {
    this.env = env
    this.kv = getKvNamespace(env)
    this.uploadService = new UploadService(env)
    this.gerritService = new GerritService(env)
    this.emailService = new EmailService(env)
    this.gitService = new GitService(env)
  }

  async createSubmission(
    uploadId: string,
    subject: string,
    description: string,
    branch: string,
    model?: string,
    notificationEmails?: string[],
    notificationCc?: string[],
    remoteNodeId?: string,
    gitRepository?: string
  ): Promise<Submission> {
    // 获取上传的文件
    const upload = await this.uploadService.getUpload(uploadId)
    if (!upload) {
      throw new Error('上传文件不存在')
    }

    if (upload.validationStatus === 'invalid') {
      throw new Error(`文件验证失败: ${upload.validationError}`)
    }

    const id = generateId()
    const submission: Submission = {
      id,
      uploadId,
      filename: upload.filename,
      project: upload.project,
      subject,
      description,
      branch,
      status: 'pending',
      model,
      notificationEmails: EmailService.normalizeEmails(notificationEmails),
      notificationCc: EmailService.normalizeEmails(notificationCc),
      remoteNodeId,
      gitRepository,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // 存储到KV
    await this.kv.put(`submissions:${id}`, JSON.stringify(submission))

    return submission
  }

  private async addLog(submissionId: string, message: string): Promise<void> {
    const submission = await this.getSubmission(submissionId)
    if (!submission) {
      return
    }

    if (!submission.logs) {
      submission.logs = []
    }

    const timestamp = new Date().toLocaleTimeString('en-US')
    submission.logs.push(`[${timestamp}] ${message}`)
    submission.updatedAt = new Date().toISOString()

    await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
  }

  async submitToGerrit(submissionId: string): Promise<Submission> {
    const submission = await this.getSubmission(submissionId)
    if (!submission) {
      throw new Error('提交记录不存在')
    }

    try {
      // 更新状态为处理中
      submission.status = 'processing'
      submission.updatedAt = new Date().toISOString()
      if (!submission.logs) {
        submission.logs = []
      }
      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.addLog(submissionId, '[Info] Starting submission process...')
      await this.sendNotification(submission, 'processing')

      // 获取上传的文件内容
      const upload = await this.uploadService.getUpload(submission.uploadId)
      if (!upload) {
        throw new Error('上传文件不存在')
      }

      await this.addLog(submissionId, `[Info] File uploaded: ${upload.filename}`)

      // If remote node and git repository are specified, execute git commands first
      if (submission.remoteNodeId && submission.gitRepository) {
        try {
          await this.addLog(submissionId, '[Info] Starting git workflow on remote node...')
          await this.addLog(submissionId, `[Info] Repository: ${submission.gitRepository}`)
          await this.addLog(submissionId, `[Info] Branch: ${submission.branch}`)

          const workDir = `/tmp/git-work-${submission.id}`
          const gitResult = await this.gitService.executeGitWorkflow(
            submission.remoteNodeId,
            submission.gitRepository,
            submission.branch,
            upload.content,
            workDir
          )

          // Log git clone results
          if (gitResult.results.clone) {
            if (gitResult.results.clone.success) {
              await this.addLog(submissionId, '[Success] Git clone completed successfully')
              if (gitResult.results.clone.output) {
                // Parse output lines - the git clone script uses [INFO], [SUCCESS], [WARN], [ERROR] prefixes
                const lines = gitResult.results.clone.output.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  // Skip the TARGET_DIR= line which is just metadata
                  if (line.startsWith('TARGET_DIR=')) {
                    continue
                  }
                  // Preserve the log prefixes from the script ([INFO], [SUCCESS], etc.)
                  if (line.includes('[INFO]') || line.includes('[SUCCESS]') || line.includes('[WARN]') || line.includes('[ERROR]')) {
                    await this.addLog(submissionId, line)
                  } else {
                    await this.addLog(submissionId, `[Git Clone] ${line}`)
                  }
                }
              }
              if (gitResult.results.clone.error) {
                const errorLines = gitResult.results.clone.error.split('\n').filter(l => l.trim())
                for (const line of errorLines) {
                  await this.addLog(submissionId, `[Git Clone Error] ${line}`)
                }
              }
            } else {
              const errorMsg = gitResult.results.clone.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              await this.addLog(submissionId, `[Error] Git clone failed: ${errorMsg}`)
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
              // Also log any output even if it failed
              if (gitResult.results.clone.output) {
                const lines = gitResult.results.clone.output.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  await this.addLog(submissionId, `[Git Clone] ${line}`)
                }
              }
            }
          }

          // Log checkout results
          if (gitResult.results.checkout) {
            if (gitResult.results.checkout.success) {
              await this.addLog(submissionId, '[Success] Branch checkout completed')
              if (gitResult.results.checkout.output) {
                const lines = gitResult.results.checkout.output.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  await this.addLog(submissionId, `[Git Checkout] ${line}`)
                }
              }
            } else {
              await this.addLog(submissionId, `[Warning] Branch checkout: ${gitResult.results.checkout.error || 'Unknown warning'}`)
            }
          }

          // Log patch apply results
          if (gitResult.results.apply) {
            if (gitResult.results.apply.success) {
              await this.addLog(submissionId, '[Success] Patch applied successfully')
              if (gitResult.results.apply.output) {
                const lines = gitResult.results.apply.output.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  await this.addLog(submissionId, `[Patch Apply] ${line}`)
                }
              }
            } else {
              const errorMsg = gitResult.results.apply.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              await this.addLog(submissionId, `[Error] Patch apply failed: ${errorMsg}`)
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
              // Also log any output even if it failed
              if (gitResult.results.apply.output) {
                const lines = gitResult.results.apply.output.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  await this.addLog(submissionId, `[Patch Apply] ${line}`)
                }
              }
            }
          }

          // Log status results
          if (gitResult.results.status) {
            if (gitResult.results.status.output) {
              await this.addLog(submissionId, '[Info] Repository status:')
              const lines = gitResult.results.status.output.split('\n').filter(l => l.trim())
              for (const line of lines) {
                await this.addLog(submissionId, `[Git Status] ${line}`)
              }
            }
          }

          if (!gitResult.success) {
            throw new Error(`Git workflow failed: ${gitResult.error || 'Unknown error'}`)
          }

          await this.addLog(submissionId, '[Success] Git workflow completed successfully')
        } catch (gitError) {
          const errorMsg = gitError instanceof Error ? gitError.message : 'Unknown error'
          await this.addLog(submissionId, `[Error] Git workflow failed: ${errorMsg}`)
          throw new Error(`Git workflow failed: ${errorMsg}`)
        }
      }

      // 提交到Gerrit (always submit to Gerrit, unless only remote node workflow is desired)
      // For now, we'll submit to Gerrit in all cases
      await this.addLog(submissionId, '[Info] Submitting patch to Gerrit...')
      await this.addLog(submissionId, `[Info] Project: ${submission.project}`)
      await this.addLog(submissionId, `[Info] Subject: ${submission.subject}`)

      const gerritResult = await this.gerritService.submitToGerrit(
        submission.uploadId,
        submission.subject,
        submission.description,
        submission.branch,
        submission.project,
        upload.content
      )

      await this.addLog(submissionId, `[Success] Patch submitted to Gerrit successfully`)
      await this.addLog(submissionId, `[Success] Change ID: ${gerritResult.changeId}`)
      await this.addLog(submissionId, `[Success] Change URL: ${gerritResult.changeUrl}`)

      // 更新提交记录
      submission.status = 'completed'
      submission.changeId = gerritResult.changeId
      submission.changeUrl = gerritResult.changeUrl
      submission.updatedAt = new Date().toISOString()

      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.sendNotification(submission, 'completed')

      return submission
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '提交失败'
      await this.addLog(submissionId, `[Error] Submission failed: ${errorMsg}`)

      // 更新错误状态
      submission.status = 'failed'
      submission.error = errorMsg
      submission.updatedAt = new Date().toISOString()

      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.sendNotification(submission, 'failed')

      throw error
    }
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const data = await this.kv.get(`submissions:${id}`)
    return data ? JSON.parse(data) : null
  }

  async getSubmissionStatus(id: string): Promise<{
    status: string
    changeId?: string
    changeUrl?: string
    createdAt: string
    error?: string
    logs?: string[]
  }> {
    const submission = await this.getSubmission(id)
    if (!submission) {
      throw new Error('提交记录不存在')
    }

    return {
      status: submission.status,
      changeId: submission.changeId,
      changeUrl: submission.changeUrl,
      createdAt: submission.createdAt,
      error: submission.error,
      logs: submission.logs
    }
  }

  private async sendNotification(submission: Submission, stage: Submission['status']) {
    try {
      await this.emailService.sendSubmissionStatusEmail(submission, stage)
    } catch (error) {
      console.error('Failed to dispatch email notification:', error)
    }
  }
}
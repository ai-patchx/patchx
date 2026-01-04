import { Env, Submission } from '../types'
import { getKvNamespace, KVLike } from '../kv'
import { generateId } from '../utils'
import { UploadService } from './uploadService'
import { GerritService } from './gerritService'
import { EmailService } from './emailService'
import { GitService } from './gitService'
import { getSupabaseClient } from '../supabase'

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
      await this.addLog(submissionId, '[Info] Submission service initialized')
      await this.addLog(submissionId, `[Info] Submission ID: ${submissionId}`)
      await this.addLog(submissionId, `[Info] Upload ID: ${submission.uploadId}`)

      try {
        await this.addLog(submissionId, '[Info] Sending notification...')
        await this.sendNotification(submission, 'processing')
        await this.addLog(submissionId, '[Info] Notification sent successfully')
      } catch (notifError) {
        // Non-fatal, just log it
        await this.addLog(submissionId, `[Warning] Failed to send notification: ${notifError instanceof Error ? notifError.message : String(notifError)}`)
      }

      // 获取上传的文件内容
      await this.addLog(submissionId, `[Info] Retrieving upload with ID: ${submission.uploadId}`)
      const uploadStartTime = Date.now()
      const upload = await this.uploadService.getUpload(submission.uploadId)
      const uploadDuration = Date.now() - uploadStartTime
      await this.addLog(submissionId, `[Info] Upload retrieval completed in ${uploadDuration}ms`)
      if (!upload) {
        await this.addLog(submissionId, `[Error] Upload not found for ID: ${submission.uploadId}`)
        throw new Error('上传文件不存在')
      }

      await this.addLog(submissionId, `[Success] File uploaded: ${upload.filename}`)
      await this.addLog(submissionId, `[Debug] Submission details - remoteNodeId: ${submission.remoteNodeId || 'not set'}, gitRepository: ${submission.gitRepository || 'not set'}, branch: ${submission.branch || 'not set'}`)

      // If remote node and git repository are specified, execute git commands first
      if (submission.remoteNodeId && submission.gitRepository) {
        await this.addLog(submissionId, '[Info] Remote node and git repository configured - executing git workflow')
        try {
          await this.addLog(submissionId, '[Info] Starting git workflow on remote node...')
          await this.addLog(submissionId, `[Info] Repository: ${submission.gitRepository}`)
          await this.addLog(submissionId, `[Info] Branch: ${submission.branch}`)
          await this.addLog(submissionId, `[Info] Remote Node ID: ${submission.remoteNodeId}`)

          // Get remote node to retrieve workingHome
          let workingHome: string | undefined
          try {
            const supabase = getSupabaseClient(this.env)
            const { data: node, error: nodeError } = await supabase
              .from('remote_nodes')
              .select('working_home')
              .eq('id', submission.remoteNodeId)
              .single()

            if (!nodeError && node) {
              workingHome = node.working_home || undefined
              if (workingHome) {
                await this.addLog(submissionId, `[Info] Using working home from remote node: ${workingHome}`)
              } else {
                await this.addLog(submissionId, '[Info] No working home configured, using default: ~/git-work')
              }
            } else {
              await this.addLog(submissionId, `[Warning] Could not retrieve remote node configuration: ${nodeError?.message || 'Node not found'}`)
            }
          } catch (nodeFetchError) {
            await this.addLog(submissionId, `[Warning] Failed to get remote node configuration: ${nodeFetchError instanceof Error ? nodeFetchError.message : String(nodeFetchError)}`)
          }

          await this.addLog(submissionId, '[Info] Step 1: Cloning repository...')
          await this.addLog(submissionId, '[Info] Calling git service executeGitWorkflow...')
          await this.addLog(submissionId, '[Info] This may take several minutes, please wait...')

          // Pass undefined for workDir to let git service use workingHome from node configuration
          // The git service will auto-generate a target directory within the workingHome
          const gitWorkflowPromise = this.gitService.executeGitWorkflow(
            submission.remoteNodeId,
            submission.gitRepository,
            submission.branch,
            upload.content,
            undefined, // Let git service use workingHome from node and auto-generate targetDir
            async (message: string) => {
              await this.addLog(submissionId, message)
            }
          )

          // Add timeout (10 minutes)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Git workflow timed out after 10 minutes'))
            }, 600000) // 10 minutes
          })

          // Pass log callback to git service for real-time logging
          const gitResult = await Promise.race([gitWorkflowPromise, timeoutPromise])

          await this.addLog(submissionId, '[Info] Git workflow execution completed')

          // Debug: Log if we got results
          if (!gitResult.results.clone && !gitResult.results.apply) {
            await this.addLog(submissionId, '[Warning] Git workflow returned no results')
          } else {
            await this.addLog(submissionId, `[Info] Git workflow returned results: clone=${!!gitResult.results.clone}, checkout=${!!gitResult.results.checkout}, apply=${!!gitResult.results.apply}, status=${!!gitResult.results.status}`)
          }

          // Log git clone results (output already logged via callback, but log summary)
          if (gitResult.results.clone) {
            // Log summary and any additional info not captured by callback
            if (gitResult.results.clone.success) {
              // Success already logged by callback
              if (!gitResult.results.clone.output || gitResult.results.clone.output.trim().length === 0) {
                await this.addLog(submissionId, '[Warning] Git clone succeeded but produced no output')
              }
            } else {
              const errorMsg = gitResult.results.clone.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              // Error already logged by callback, but add timeout warning if needed
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
            }
          } else {
            await this.addLog(submissionId, '[Error] Git clone did not execute - no result returned')
          }

          // Log checkout results (output already logged via callback)
          if (gitResult.results.checkout) {
            // Summary already logged by callback
            if (!gitResult.results.checkout.success && !gitResult.results.checkout.output) {
              await this.addLog(submissionId, `[Warning] Branch checkout failed with no output: ${gitResult.results.checkout.error || 'Unknown error'}`)
            }
          }

          // Log patch apply results (output already logged via callback)
          if (gitResult.results.apply) {
            // Summary already logged by callback
            if (!gitResult.results.apply.success) {
              const errorMsg = gitResult.results.apply.error || 'Unknown error'
              const isTimeout = errorMsg.includes('timed out') || errorMsg.includes('timeout')
              if (isTimeout) {
                await this.addLog(submissionId, '[Warning] Command timed out - this may indicate network issues or the command is taking too long')
              }
            } else if (!gitResult.results.apply.output || gitResult.results.apply.output.trim().length === 0) {
              await this.addLog(submissionId, '[Info] Patch applied successfully (no output from git apply)')
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
          const errorMsg = gitError instanceof Error ? gitError.message : String(gitError)
          const errorStack = gitError instanceof Error ? gitError.stack : undefined
          await this.addLog(submissionId, `[Error] Git workflow failed: ${errorMsg}`)
          if (errorStack) {
            await this.addLog(submissionId, `[Error] Stack trace: ${errorStack}`)
          }
          // Don't throw - continue to Gerrit submission even if git workflow fails
          // The user might still want to submit the patch directly
          await this.addLog(submissionId, '[Warning] Continuing to Gerrit submission despite git workflow failure')
        }
      } else {
        // Log if git workflow is not being executed
        await this.addLog(submissionId, '[Info] Git workflow check:')
        if (!submission.remoteNodeId) {
          await this.addLog(submissionId, '[Info] - No remote node selected - skipping git workflow')
        }
        if (!submission.gitRepository) {
          await this.addLog(submissionId, '[Info] - No git repository configured - skipping git workflow')
        }
        if (submission.remoteNodeId && submission.gitRepository) {
          await this.addLog(submissionId, '[Warning] Both remote node and git repository are set, but git workflow was not executed (this should not happen)')
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

    // Ensure logs array exists
    if (!submission.logs) {
      submission.logs = []
    }

    // Debug: Log status retrieval (only occasionally to avoid spam)
    const shouldLog = Math.random() < 0.1 // Log 10% of requests
    if (shouldLog) {
      console.log(`[Submission Status] ID: ${id}, Status: ${submission.status}, Logs count: ${submission.logs.length}`)
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
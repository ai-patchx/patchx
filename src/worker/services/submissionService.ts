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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // 存储到KV
    await this.kv.put(`submissions:${id}`, JSON.stringify(submission))

    return submission
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
      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.sendNotification(submission, 'processing')

      // 获取上传的文件内容
      const upload = await this.uploadService.getUpload(submission.uploadId)
      if (!upload) {
        throw new Error('上传文件不存在')
      }

      // If remote node and git repository are specified, execute git commands first
      if (submission.remoteNodeId && submission.gitRepository) {
        try {
          const workDir = `/tmp/git-work-${submission.id}`
          const gitResult = await this.gitService.executeGitWorkflow(
            submission.remoteNodeId,
            submission.gitRepository,
            submission.branch,
            upload.content,
            workDir
          )

          if (!gitResult.success) {
            throw new Error(`Git workflow failed: ${gitResult.error || 'Unknown error'}`)
          }

          // Store git workflow results in submission (optional, for debugging)
          console.log('Git workflow completed successfully:', gitResult.results)
        } catch (gitError) {
          // If git workflow fails, we can still try to submit to Gerrit
          // or fail the submission entirely - for now, we'll fail the submission
          throw new Error(
            `Git workflow failed: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`
          )
        }
      }

      // 提交到Gerrit (always submit to Gerrit, unless only remote node workflow is desired)
      // For now, we'll submit to Gerrit in all cases
      const gerritResult = await this.gerritService.submitToGerrit(
        submission.uploadId,
        submission.subject,
        submission.description,
        submission.branch,
        submission.project,
        upload.content
      )

      // 更新提交记录
      submission.status = 'completed'
      submission.changeId = gerritResult.changeId
      submission.changeUrl = gerritResult.changeUrl
      submission.updatedAt = new Date().toISOString()

      await this.kv.put(`submissions:${submissionId}`, JSON.stringify(submission))
      await this.sendNotification(submission, 'completed')

      return submission
    } catch (error) {
      // 更新错误状态
      submission.status = 'failed'
      submission.error = error instanceof Error ? error.message : '提交失败'
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
      error: submission.error
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
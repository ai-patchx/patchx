import { Env, Submission } from '../types'
import { generateId } from '../utils'
import { UploadService } from './uploadService'
import { GerritService } from './gerritService'

export class SubmissionService {
  private env: Env
  private uploadService: UploadService
  private gerritService: GerritService

  constructor(env: Env) {
    this.env = env
    this.uploadService = new UploadService(env)
    this.gerritService = new GerritService(env)
  }

  async createSubmission(
    uploadId: string,
    subject: string,
    description: string,
    branch: string
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // 存储到KV
    await this.env.AOSP_PATCH_KV.put(`submissions:${id}`, JSON.stringify(submission))

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
      await this.env.AOSP_PATCH_KV.put(`submissions:${submissionId}`, JSON.stringify(submission))

      // 获取上传的文件内容
      const upload = await this.uploadService.getUpload(submission.uploadId)
      if (!upload) {
        throw new Error('上传文件不存在')
      }

      // 提交到Gerrit
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

      await this.env.AOSP_PATCH_KV.put(`submissions:${submissionId}`, JSON.stringify(submission))

      return submission
    } catch (error) {
      // 更新错误状态
      submission.status = 'failed'
      submission.error = error instanceof Error ? error.message : '提交失败'
      submission.updatedAt = new Date().toISOString()

      await this.env.AOSP_PATCH_KV.put(`submissions:${submissionId}`, JSON.stringify(submission))

      throw error
    }
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const data = await this.env.AOSP_PATCH_KV.get(`submissions:${id}`)
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
}
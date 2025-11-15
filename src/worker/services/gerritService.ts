import { Env } from '../types'

export class GerritService {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  async submitToGerrit(
    uploadId: string,
    subject: string,
    description: string,
    branch: string,
    project: string,
    patchContent: string
  ): Promise<{
    changeId: string
    changeUrl: string
    status: string
  }> {
    try {
      // 构建Gerrit API请求
      const changeData = {
        project: project.replace('platform/', ''), // 移除platform前缀
        branch,
        subject,
        topic: 'aosp-patch-service',
        status: 'NEW'
      }

      // 创建change
      const createResponse = await fetch(`${this.env.GERRIT_BASE_URL}/a/changes/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
        },
        body: JSON.stringify(changeData)
      })

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        throw new Error(`创建Gerrit change失败: ${errorText}`)
      }

      const changeInfo = await createResponse.json() as { _number?: number; id?: string }
      const changeId = (changeInfo._number ?? changeInfo.id ?? '').toString()

      // 上传patch set
      const patchSetData = {
        patch: patchContent,
        message: `${subject}\n\n${description}`
      }

      const uploadResponse = await fetch(
        `${this.env.GERRIT_BASE_URL}/a/changes/${changeId}/revisions/current/patch`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
          },
          body: JSON.stringify(patchSetData)
        }
      )

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`上传patch set失败: ${errorText}`)
      }

      const changeUrl = `${this.env.GERRIT_BASE_URL}/#/c/${changeId}/`

      return {
        changeId: changeId.toString(),
        changeUrl,
        status: 'success'
      }
    } catch (error) {
      console.error('Gerrit提交错误:', error)
      throw error
    }
  }

  async getChangeStatus(changeId: string): Promise<{
    status: string
    mergeable: boolean
    submittable: boolean
  }> {
    try {
      const response = await fetch(
        `${this.env.GERRIT_BASE_URL}/a/changes/${changeId}/detail`,
        {
          headers: {
            'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
          }
        }
      )

      if (!response.ok) {
        throw new Error('获取change状态失败')
      }

      const data = await response.json() as { status?: string; mergeable?: boolean; submittable?: boolean }

      return {
        status: data.status || 'UNKNOWN',
        mergeable: data.mergeable || false,
        submittable: data.submittable || false
      }
    } catch (error) {
      console.error('获取Gerrit状态错误:', error)
      throw error
    }
  }
}
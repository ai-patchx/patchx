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
    patchContent: string,
    timeoutMs: number = 180000 // Default 3 minutes timeout
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

      // Create AbortController for timeout
      const createController = new AbortController()
      const createTimeoutId = setTimeout(() => {
        createController.abort()
      }, timeoutMs)

      try {
        // 创建change
        const createResponse = await fetch(`${this.env.GERRIT_BASE_URL}/a/changes/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
          },
          body: JSON.stringify(changeData),
          signal: createController.signal
        })

        clearTimeout(createTimeoutId)

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

        // Create AbortController for patch upload timeout
        const uploadController = new AbortController()
        const uploadTimeoutId = setTimeout(() => {
          uploadController.abort()
        }, timeoutMs)

        try {
          const uploadResponse = await fetch(
            `${this.env.GERRIT_BASE_URL}/a/changes/${changeId}/revisions/current/patch`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
              },
              body: JSON.stringify(patchSetData),
              signal: uploadController.signal
            }
          )

          clearTimeout(uploadTimeoutId)

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
        } catch (uploadError) {
          clearTimeout(uploadTimeoutId)
          if (uploadError instanceof Error && uploadError.name === 'AbortError') {
            throw new Error(`上传patch set超时: 操作在 ${timeoutMs}ms 后超时`)
          }
          throw uploadError
        }
      } catch (createError) {
        clearTimeout(createTimeoutId)
        if (createError instanceof Error && createError.name === 'AbortError') {
          throw new Error(`创建Gerrit change超时: 操作在 ${timeoutMs}ms 后超时`)
        }
        throw createError
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

  /**
   * Fetch all projects from Gerrit REST API
   * According to https://gerrit-review.googlesource.com/Documentation/rest-api-projects.html
   * GET /projects/ returns a map of project names to ProjectInfo entries
   */
  async getProjects(options?: {
    prefix?: string
    substring?: string
    regex?: string
    limit?: number
    skip?: number
    all?: boolean
    state?: 'ACTIVE' | 'READ_ONLY' | 'HIDDEN'
    type?: 'ALL' | 'CODE' | 'PERMISSIONS'
    description?: boolean
  }): Promise<Array<{ id: string; name: string; description?: string }>> {
    try {
      const params = new URLSearchParams()

      if (options?.prefix) {
        params.append('p', options.prefix)
      }
      if (options?.substring) {
        params.append('m', options.substring)
      }
      if (options?.regex) {
        params.append('r', options.regex)
      }
      if (options?.limit) {
        params.append('n', options.limit.toString())
      }
      if (options?.skip) {
        params.append('S', options.skip.toString())
      }
      if (options?.all) {
        params.append('all', '')
      }
      if (options?.state) {
        params.append('s', options.state)
      }
      if (options?.type) {
        params.append('type', options.type)
      }
      if (options?.description) {
        params.append('d', '')
      }

      const queryString = params.toString()
      const url = `${this.env.GERRIT_BASE_URL}/a/projects${queryString ? `?${queryString}` : ''}`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch projects: ${errorText}`)
      }

      // Gerrit API returns JSON with a )]}' prefix that needs to be stripped
      const text = await response.text()
      const jsonText = text.replace(/^\)\]\}\'/, '').trim()
      const projectsMap = JSON.parse(jsonText) as Record<string, { id: string; description?: string }>

      // Convert map to array and format for frontend
      // The map key is the project name, and the value contains id (URL-encoded) and optional description
      const projects = Object.entries(projectsMap).map(([key, info]) => {
        // The key is the project name (may be URL-encoded)
        // The info.id is also the project name (URL-encoded)
        // Decode both to get the actual project name
        const decodedKey = decodeURIComponent(key)
        const decodedId = decodeURIComponent(info.id)

        // Use the decoded key as the display name (it's usually more readable)
        // Use the decoded id as the project identifier
        const projectName = decodedKey || decodedId
        const projectId = decodedId || decodedKey

        return {
          id: projectId,
          name: projectName,
          description: info.description
        }
      })

      // Sort by name for better UX
      return projects.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error('Error fetching Gerrit projects:', error)
      throw error
    }
  }

  /**
   * Fetch all branches for a specific project from Gerrit REST API
   * According to https://gerrit-review.googlesource.com/Documentation/rest-api-projects.html
   * GET /projects/{project-name}/branches/ returns a list of branches
   */
  async getBranches(projectName: string): Promise<Array<{ ref: string; revision: string; name: string }>> {
    try {
      // URL encode the project name (e.g., "platform/frameworks/base" -> "platform%2Fframeworks%2Fbase")
      const encodedProjectName = encodeURIComponent(projectName)
      const url = `${this.env.GERRIT_BASE_URL}/a/projects/${encodedProjectName}/branches/`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${btoa(`${this.env.GERRIT_USERNAME}:${this.env.GERRIT_PASSWORD}`)}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch branches: ${errorText}`)
      }

      // Gerrit API returns JSON with a )]}' prefix that needs to be stripped
      const text = await response.text()
      const jsonText = text.replace(/^\)\]\}\'/, '').trim()
      const branches = JSON.parse(jsonText) as Array<{ ref: string; revision: string }>

      // Extract branch names from refs (e.g., "refs/heads/master" -> "master")
      return branches.map(branch => ({
        ref: branch.ref,
        revision: branch.revision,
        // Extract short branch name from ref
        name: branch.ref.replace(/^refs\/heads\//, '')
      })).sort((a, b) => {
        // Sort branches: main/master first, then alphabetically
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        if (aName === 'main') return -1
        if (bName === 'main') return 1
        if (aName === 'master') return -1
        if (bName === 'master') return 1
        return a.name.localeCompare(b.name)
      })
    } catch (error) {
      console.error('Error fetching Gerrit branches:', error)
      throw error
    }
  }
}
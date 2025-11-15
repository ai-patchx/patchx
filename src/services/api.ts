import { UploadResponse, ApiResponse, StatusResponse } from '../types'

const API_BASE_URL = '/api'

export const uploadFile = async (file: File, project: string): Promise<UploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('project', project)

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || '文件上传失败')
  }

  return response.json()
}

export const submitPatch = async (data: {
  uploadId: string
  subject: string
  description: string
  branch: string
}): Promise<ApiResponse<{ submissionId: string; status: string }>> => {
  const response = await fetch(`${API_BASE_URL}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || 'Patch提交失败')
  }

  return response.json()
}

export const getSubmissionStatus = async (id: string): Promise<ApiResponse<StatusResponse>> => {
  const response = await fetch(`${API_BASE_URL}/status/${id}`)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || '获取状态失败')
  }

  return response.json()
}
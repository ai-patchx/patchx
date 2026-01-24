import { Env, Upload } from '../types'
import { generateId, validatePatchFile } from '../utils'
import { getKvNamespace, KVLike } from '../kv'

export class UploadService {
  private env: Env
  private kv: KVLike

  constructor(env: Env) {
    this.env = env
    this.kv = getKvNamespace(env)
  }

  async createUpload(file: File, project: string): Promise<Upload> {
    const id = generateId()
    const filename = file.name
    const content = await file.text()

    // Validate patch file
    const validation = validatePatchFile(content)

    const upload: Upload = {
      id,
      filename,
      content,
      project,
      validationStatus: validation.valid ? 'valid' : 'invalid',
      validationError: validation.error,
      createdAt: new Date().toISOString()
    }

    // Store to KV
    await this.kv.put(`uploads:${id}`, JSON.stringify(upload))

    return upload
  }

  async getUpload(id: string): Promise<Upload | null> {
    const data = await this.kv.get(`uploads:${id}`)
    return data ? JSON.parse(data) : null
  }

  async validateAndStoreUpload(file: File, project: string): Promise<{
    uploadId: string
    status: string
    message: string
  }> {
    try {
      const upload = await this.createUpload(file, project)

      if (upload.validationStatus === 'invalid') {
        return {
          uploadId: upload.id,
          status: 'error',
          message: upload.validationError || 'File validation failed'
        }
      }

      return {
        uploadId: upload.id,
        status: 'success',
        message: 'File uploaded successfully'
      }
    } catch (error) {
      return {
        uploadId: '',
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      }
    }
  }
}
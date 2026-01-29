export type PatchxUploadResponse =
  | {
      success: true
      data: {
        uploadId?: string
        id?: string
        status?: string
        message?: string
        [k: string]: unknown
      }
    }
  | { success: false; error: string; [k: string]: unknown }

export type PatchxSubmitResponse =
  | { success: true; data: { submissionId: string; status: string } }
  | { success: false; error: string; [k: string]: unknown }

export type PatchxStatusResponse =
  | {
      success: true
      data: {
        status: string
        changeId?: string
        changeUrl?: string
        createdAt?: string
        updatedAt?: string
        error?: string | null
        logs?: string[]
        [k: string]: unknown
      }
    }
  | { success: false; error: string; [k: string]: unknown }


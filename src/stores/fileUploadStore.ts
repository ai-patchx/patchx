import { create } from 'zustand'

interface FileUploadState {
  file: File | null
  uploadProgress: number
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error'
  error: string | null
  uploadId: string | null
}

interface FileUploadActions {
  setFile: (file: File | null) => void
  setUploadProgress: (progress: number) => void
  setUploadStatus: (status: FileUploadState['uploadStatus']) => void
  setError: (error: string | null) => void
  setUploadId: (id: string | null) => void
  resetUpload: () => void
}

const useFileUploadStore = create<FileUploadState & FileUploadActions>((set) => ({
  file: null,
  uploadProgress: 0,
  uploadStatus: 'idle',
  error: null,
  uploadId: null,

  setFile: (file) => set({ file }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  setUploadStatus: (status) => set({ uploadStatus: status }),
  setError: (error) => set({ error }),
  setUploadId: (id) => set({ uploadId: id }),
  resetUpload: () => set({
    file: null,
    uploadProgress: 0,
    uploadStatus: 'idle',
    error: null,
    uploadId: null
  })
}))

export default useFileUploadStore
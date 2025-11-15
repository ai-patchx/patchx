import { useState, useRef } from 'react'
import { Upload, File, AlertCircle, CheckCircle } from 'lucide-react'
import useFileUploadStore from '../stores/fileUploadStore'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept = '.patch,.diff',
  maxSize = 10 * 1024 * 1024 // 10MB
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { file, uploadStatus, error, setFile, setError } = useFileUploadStore()

  const validateFile = (file: File): string | null => {
    if (!file.name.match(/\.(patch|diff)$/i)) {
      return '请上传 .patch 或 .diff 格式的文件'
    }

    if (file.size > maxSize) {
      return `文件大小不能超过 ${maxSize / 1024 / 1024}MB`
    }

    return null
  }

  const handleFileSelect = (selectedFile: File) => {
    const validationError = validateFile(selectedFile)

    if (validationError) {
      setError(validationError)
      return
    }

    setFile(selectedFile)
    setError(null)
    onFileSelect(selectedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const getStatusIcon = () => {
    if (uploadStatus === 'success') {
      return <CheckCircle className="w-8 h-8 text-green-500" />
    }
    if (uploadStatus === 'error') {
      return <AlertCircle className="w-8 h-8 text-red-500" />
    }
    return <Upload className="w-8 h-8 text-gray-400" />
  }

  return (
    <div className="w-full">
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200 ease-in-out
          ${
            isDragOver
              ? 'border-green-400 bg-green-50'
              : error
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 hover:border-gray-400'
          }
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center space-y-4">
          {getStatusIcon()}

          {file ? (
            <div className="flex items-center space-x-2">
              <File className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                {file.name}
              </span>
              <span className="text-xs text-gray-500">
                ({(file.size / 1024).toFixed(1)}KB)
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-700">
                拖拽文件到此处或点击选择
              </p>
              <p className="text-sm text-gray-500">
                支持 .patch 和 .diff 格式，最大 {maxSize / 1024 / 1024}MB
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 p-3 bg-red-100 border border-red-300 rounded-md">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileUpload
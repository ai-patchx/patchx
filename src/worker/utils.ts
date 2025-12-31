export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const validatePatchFile = (content: string): { valid: boolean; error?: string } => {
  try {
    // 检查是否包含patch文件的基本格式
    if (!content.includes('---') || !content.includes('+++')) {
      return { valid: false, error: '无效的patch格式：缺少文件头信息' }
    }

    // 检查是否包含diff块
    const diffBlocks = content.split(/^@@/m)
    if (diffBlocks.length < 2) {
      return { valid: false, error: '无效的patch格式：缺少diff块' }
    }

    // 检查每个diff块的格式
    for (let i = 1; i < diffBlocks.length; i++) {
      const block = diffBlocks[i]
      const lines = block.split('\n')

      // 检查diff头格式 - 由于split移除了@@，需要重新添加或直接匹配内容
      // lines[0] 应该是类似 " -209,8 +209,8 @@" 的格式（没有开头的@@）
      const firstLine = lines[0].trim()
      // 匹配格式: -数字(,数字)? +数字(,数字)? @@ (可选的其他内容如函数名)
      const headerMatch = firstLine.match(/^-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@.*$/)
      if (!headerMatch) {
        return { valid: false, error: `第 ${i} 个diff块格式错误` }
      }

      // 检查行格式
      let hasChanges = false
      for (let j = 1; j < lines.length; j++) {
        const line = lines[j]
        if (line.length === 0) continue

        // 如果遇到新文件或新diff块的标记，停止检查（这些是下一个文件/块的内容）
        if (line.startsWith('diff --git') ||
            (line.startsWith('--- ') && j > 1) ||
            (line.startsWith('+++ ') && j > 1) ||
            line.startsWith('index ')) {
          break
        }

        // 检查行前缀
        const firstChar = line[0]
        if (firstChar === '+' || firstChar === '-') {
          hasChanges = true
        } else if (firstChar !== ' ' && firstChar !== '\\') {
          return { valid: false, error: `第 ${i} 个diff块中第 ${j} 行格式错误` }
        }
      }

      if (!hasChanges) {
        return { valid: false, error: `第 ${i} 个diff块中没有实际的更改` }
      }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `验证patch文件时出错: ${error instanceof Error ? error.message : '未知错误'}` }
  }
}

type ParsedFile = {
  oldPath: string
  newPath?: string
  additions: number
  deletions: number
}

export const parsePatchContent = (content: string) => {
  const lines = content.split('\n')
  const files: ParsedFile[] = []

  let currentFile: ParsedFile | null = null
  let inDiff = false

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      const oldPath = line.substring(4).split('\t')[0]
      currentFile = { oldPath, additions: 0, deletions: 0 }
    } else if (line.startsWith('+++ ')) {
      const newPath = line.substring(4).split('\t')[0]
      if (currentFile) {
        currentFile.newPath = newPath
      }
    } else if (line.startsWith('@@')) {
      inDiff = true
    } else if (inDiff && line.length > 0) {
      const firstChar = line[0]
      if (firstChar === '+') {
        if (currentFile) currentFile.additions++
      } else if (firstChar === '-') {
        if (currentFile) currentFile.deletions++
      } else if (firstChar === ' ' || firstChar === '\\') {
        // Context line or escape sequence, do nothing
      } else {
        inDiff = false
      }
    }

    if (currentFile && !inDiff && line === '') {
      files.push(currentFile)
      currentFile = null
    }
  }

  if (currentFile) {
    files.push(currentFile)
  }

  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0)
  }
}
export const validatePatchFile = (content: string): { valid: boolean; error?: string } => {
  try {
    // Check if patch file contains basic format
    if (!content.includes('---') || !content.includes('+++')) {
      return { valid: false, error: 'Invalid patch format: missing file header information' }
    }

    // Check if diff blocks are present
    const diffBlocks = content.split(/^@@/m)
    if (diffBlocks.length < 2) {
      return { valid: false, error: 'Invalid patch format: missing diff blocks' }
    }

    // Check format of each diff block
    for (let i = 1; i < diffBlocks.length; i++) {
      const block = diffBlocks[i]
      const lines = block.split('\n')

      // Check diff header format - since split removed @@, need to match content directly
      // lines[0] should be in format like " -209,8 +209,8 @@" (without leading @@)
      const firstLine = lines[0].trim()
      // Match format: -number(,number)? +number(,number)? @@ (optional other content like function name)
      const headerMatch = firstLine.match(/^-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@.*$/)
      if (!headerMatch) {
        return { valid: false, error: `Diff block ${i} format error` }
      }

      // Check line format
      let hasChanges = false
      for (let j = 1; j < lines.length; j++) {
        const line = lines[j]
        if (line.length === 0) continue

        // If encountering new file or new diff block markers, stop checking (these are content of next file/block)
        if (line.startsWith('diff --git') ||
            (line.startsWith('--- ') && j > 1) ||
            (line.startsWith('+++ ') && j > 1) ||
            line.startsWith('index ')) {
          break
        }

        // Check line prefix
        const firstChar = line[0]
        if (firstChar === '+' || firstChar === '-') {
          hasChanges = true
        } else if (firstChar !== ' ' && firstChar !== '\\') {
          return { valid: false, error: `Line ${j} in diff block ${i} format error` }
        }
      }

      if (!hasChanges) {
        return { valid: false, error: `Diff block ${i} has no actual changes` }
      }
    }

    return { valid: true }
  } catch (error) {
    return { valid: false, error: `Error validating patch file: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

type ParsedFile = {
  oldPath: string
  newPath?: string
  additions: number
  deletions: number
}

export const parsePatchFile = (content: string) => {
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
        currentFile.additions++
      } else if (firstChar === '-') {
        currentFile.deletions++
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
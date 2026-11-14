import * as fs from 'fs'
import * as path from 'path'

/**
 * 将数据库中的文件路径转换为本地可用路径
 * 处理生产环境绝对路径（如 /var/www/resume-system/hr/data/uploads/...）
 * 在本地开发环境不可用的情况
 *
 * 解析策略：
 * 1. 路径本身已存在 → 直接返回
 * 2. 替换生产前缀为本地 uploads 目录 → 存在则返回
 * 3. 按文件名在 uploads 目录下搜索 → 找到则返回
 * 4. 都找不到 → 返回替换后的路径（让调用方处理 404）
 */
export function resolveLocalFilePath(filePath: string): string {
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads')

  // 策略1: 路径本地已存在，且在本地 uploads 目录下，直接返回
  if (fs.existsSync(filePath)) {
    const resolved = path.resolve(filePath)
    if (resolved.startsWith(uploadsDir + path.sep) || resolved === uploadsDir) {
      return filePath
    }
  }

  // 策略2: 提取 data/uploads/ 之后的相对路径，拼接到本地 uploads 目录
  const uploadsMarker = 'data/uploads/'
  const idx = filePath.indexOf(uploadsMarker)
  let resolvedPath = filePath
  if (idx !== -1) {
    const relativePath = filePath.slice(idx + uploadsMarker.length)
    resolvedPath = path.join(uploadsDir, relativePath)
  }

  if (fs.existsSync(resolvedPath)) {
    return resolvedPath
  }

  // 策略3: 按文件名在 uploads 目录下搜索（处理 emailId 不同的情况）
  const fileName = path.basename(filePath)
  if (fileName && fs.existsSync(uploadsDir)) {
    const found = searchFileByName(uploadsDir, fileName)
    if (found) {
      return found
    }
  }

  // 策略4: 返回替换后的路径
  return resolvedPath
}

/**
 * 在目录下递归搜索指定文件名
 */
function searchFileByName(dir: string, fileName: string): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name, fileName)
        if (fs.existsSync(fullPath)) {
          return fullPath
        }
      }
    }
  } catch {
    // 目录读取失败，忽略
  }
  return null
}

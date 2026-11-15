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
    const inside = resolveInsideUploads(filePath, uploadsDir)
    if (inside) {
      return inside
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
    return requireInsideUploads(resolvedPath, uploadsDir)
  }

  // 策略3: 按文件名在 uploads 目录下搜索（处理 emailId 不同的情况）
  const fileName = path.basename(filePath)
  if (fileName && fs.existsSync(uploadsDir)) {
    const found = searchFileByName(uploadsDir, fileName)
    if (found) {
      return requireInsideUploads(found, uploadsDir)
    }
  }

  // 策略4: 返回替换后的路径（调用方据此判 404），同样先过边界守卫
  return requireInsideUploads(resolvedPath, uploadsDir)
}

/**
 * 附件目录边界守卫。
 *
 * 数据库里的 filePath 可能来自历史迁移、手工导入或外部邮件，若含 ../ 会
 * 让 path.join 跑出 uploads 目录。原先只有「文件下载」接口做了校验，照片、
 * 重新解析、解析服务这三个读取入口是裸的；现在统一收敛到路径解析这一层，
 * 所有调用方自动受保护，不需要每个接口各写一遍。
 *
 * 越界时不抛出原始路径，而是返回一个 uploads 内必定不存在的占位路径，
 * 让调用方按既有的「文件不存在」流程返回 404，不向客户端泄漏服务器目录结构。
 */
export function resolveInsideUploads(candidate: string, uploadsDir?: string): string | null {
  const root = uploadsDir ?? path.resolve(process.cwd(), 'data', 'uploads')
  const resolved = path.resolve(candidate)
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null
}

function requireInsideUploads(candidate: string, uploadsDir: string): string {
  return resolveInsideUploads(candidate, uploadsDir)
    ?? path.join(uploadsDir, '__outside_uploads__')
}

/**
 * 清洗邮件附件名，只保留可安全用于文件系统的一段文件名。
 *
 * 附件名完全由外部邮件提供，可能被构造成 ../、绝对路径、控制字符或超长名。
 * 先取 basename 再剥掉分隔符、控制字符、首尾点号与空白，最后兜底成固定名，
 * 保证落盘路径永远拼不出附件目录之外的位置。
 */
export function safeAttachmentName(name: unknown, fallback = 'attachment'): string {
  const raw = typeof name === 'string' && name ? name : ''
  const base = path.basename(raw.replace(/[/\\\0]/g, '-'))
  const cleaned = base
    .replace(/[<>:"|?*\x00-\x1f\x7f]/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .trim()

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallback
  }
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned
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

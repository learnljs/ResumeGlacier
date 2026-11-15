import { describe, expect, it } from 'vitest'
import * as path from 'path'
import { resolveInsideUploads, safeAttachmentName } from '@/lib/utils/file-path'

const uploadsRoot = path.resolve(process.cwd(), 'data', 'uploads')

describe('resolveInsideUploads', () => {
  it('接受附件目录内的路径', () => {
    const target = path.join(uploadsRoot, 'email-1', 'resume.pdf')
    expect(resolveInsideUploads(target, uploadsRoot)).toBe(target)
  })

  it('把附件目录本身视为合法边界', () => {
    expect(resolveInsideUploads(uploadsRoot, uploadsRoot)).toBe(uploadsRoot)
  })

  it('拒绝 ../ 逃出附件目录的路径', () => {
    const escaped = path.join(uploadsRoot, '..', '..', 'etc', 'passwd')
    expect(resolveInsideUploads(escaped, uploadsRoot)).toBeNull()
  })

  it('拒绝同前缀的兄弟目录（uploads-backup 不算 uploads 内）', () => {
    const sibling = `${uploadsRoot}-backup`
    expect(resolveInsideUploads(path.join(sibling, 'secret.pdf'), uploadsRoot)).toBeNull()
  })
})

describe('safeAttachmentName', () => {
  it('把带 ../ 的附件名压成普通文件名', () => {
    const safe = safeAttachmentName('../../etc/passwd')
    expect(safe).not.toContain('/')
    expect(safe).not.toContain('\\')
    expect(safe).not.toBe('..')
    expect(path.basename(safe)).toBe(safe)
  })

  it('剥掉 Windows 盘符、问号等非法字符', () => {
    const safe = safeAttachmentName('C:\\Windows\\..\\secret?.pdf')
    expect(safe).not.toContain(':')
    expect(safe).not.toContain('?')
    expect(safe).not.toContain('\\')
    expect(path.basename(safe)).toBe(safe)
  })

  it('空名、..、非字符串都回退到兜底名', () => {
    expect(safeAttachmentName('', 'fallback.pdf')).toBe('fallback.pdf')
    expect(safeAttachmentName('..', 'fallback.pdf')).toBe('fallback.pdf')
    expect(safeAttachmentName(undefined, 'fallback.pdf')).toBe('fallback.pdf')
  })

  it('保留正常的中文文件名', () => {
    expect(safeAttachmentName('张三-简历.pdf')).toBe('张三-简历.pdf')
  })

  it('超长文件名截断到 180 字', () => {
    expect(safeAttachmentName('a'.repeat(400)).length).toBe(180)
  })
})

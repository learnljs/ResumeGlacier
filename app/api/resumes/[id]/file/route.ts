import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { resolveLocalFilePath } from '@/lib/utils/file-path'
import * as fs from 'fs'
import * as path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const format = request.nextUrl.searchParams.get('format')

    const resume = await prisma.resume.findUnique({
      where: { id },
      select: { filePath: true, fileType: true, fileName: true },
    })

    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    if (!resume.filePath) {
      return NextResponse.json({ error: '简历文件路径未记录' }, { status: 404 })
    }

    const localPath = resolveLocalFilePath(resume.filePath)

    if (!fs.existsSync(localPath)) {
      return NextResponse.json({ error: '简历文件不存在' }, { status: 404 })
    }

    // 安全检查：确保文件路径在 uploads 目录下
    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads')
    const resolvedPath = path.resolve(localPath)
    if (!resolvedPath.startsWith(uploadsDir + path.sep) && resolvedPath !== uploadsDir) {
      return NextResponse.json({ error: '非法的文件路径' }, { status: 403 })
    }

    const buffer = fs.readFileSync(localPath)

    // DOCX -> HTML 转换
    if (format === 'html' && resume.fileType === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ buffer })
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.6; padding: 16px; color: #333; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; }
td, th { border: 1px solid #ddd; padding: 6px 8px; }
img { max-width: 100%; }
</style></head><body>${result.value}</body></html>`
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    // 原始文件
    const contentType = resume.fileType === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const encodedFileName = encodeURIComponent(resume.fileName)

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodedFileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '文件获取失败')
  }
}

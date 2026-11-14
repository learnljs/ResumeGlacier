/**
 * 照片提取 API
 * 从 PDF 简历中提取候选人照片
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/services/api-error'
import { prisma } from '@/lib/prisma'
import { extractPhotoFromPdf, photoToBase64 } from '@/lib/services/pdf-image-extractor'
import { resolveLocalFilePath } from '@/lib/utils/file-path'
import path from 'path'
import fs from 'fs/promises'

const PHOTO_DIR = path.join(process.cwd(), 'public', 'photos')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 确保照片目录存在
    await fs.mkdir(PHOTO_DIR, { recursive: true })

    // 获取简历
    const resume = await prisma.resume.findUnique({ where: { id } })
    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    // 获取简历文件
    let pdfBuffer: Buffer | null = null

    if (resume.filePath) {
      try {
        const localPath = resolveLocalFilePath(resume.filePath)
        pdfBuffer = await fs.readFile(localPath)
      } catch {
        // 文件不存在
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: '简历文件不存在' }, { status: 400 })
    }

    // 提取照片
    const photo = await extractPhotoFromPdf(pdfBuffer)

    if (!photo) {
      return NextResponse.json({
        success: false,
        message: '未检测到照片',
      })
    }

    // 保存照片
    const photoFileName = `${resume.id}-${Date.now()}.png`
    const photoPath = path.join(PHOTO_DIR, photoFileName)
    const photoUrl = `/photos/${photoFileName}`

    const { savePhoto } = await import('@/lib/services/pdf-image-extractor')
    await savePhoto(photo, photoPath)

    // 更新简历记录
    await prisma.resume.update({
      where: { id },
      data: { candidatePhoto: photoUrl },
    })

    return NextResponse.json({
      success: true,
      photoUrl,
      confidence: photo.confidence,
      base64: photoToBase64(photo),
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '照片处理失败')
  }
}

/**
 * 获取候选人头像文件
 *
 * 生产模式(standalone)的 public 静态服务在启动时扫描 public 目录，
 * 运行时新增的头像文件返回 404 直到重启。头像改走 API 读盘返回，
 * 本地开发与生产行为一致，无需重启。
 *
 * 不查 DB：文件名格式为 {id}-{ts}.png / {id}_{ts}.jpg，id 为 cuid，
 * 用前缀匹配 + 取最新时间戳即可定位文件；文件系统即真相，省一次 SQLite 读，
 * 也不存在 DB 记录与磁盘文件不一致的问题。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // cuid 仅含小写字母数字，正则双重保险，避免把任意输入拼进路径
    if (!/^[a-z0-9]+$/.test(id)) {
      return NextResponse.json({ error: '无效的简历 ID' }, { status: 400 })
    }
    const dir = path.join(process.cwd(), 'public', 'photos')
    let files: string[]
    try {
      files = await fs.readdir(dir)
    } catch {
      return NextResponse.json({ error: '头像文件不存在' }, { status: 404 })
    }
    // 时间戳为等长 13 位数字，字典序即时间序，取最新一次提取的头像
    const file = files
      .filter((f) => f.startsWith(`${id}-`) || f.startsWith(`${id}_`))
      .sort((a, b) => b.localeCompare(a))[0]
    if (!file) {
      return NextResponse.json({ error: '未提取头像' }, { status: 404 })
    }
    const buffer = await fs.readFile(path.join(dir, file))
    const ext = path.extname(file).toLowerCase()
    const contentType =
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.gif' ? 'image/gif'
      : 'image/png'
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '照片处理失败')
  }
}

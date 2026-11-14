import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { parseResume, resolveCandidateName } from '@/lib/services/resume-parser'
import { matchPositionForResume } from '@/lib/services/position-matcher'
import {
  assertParseQuality,
  saveStructuredData,
  FRAGMENTATION_REASON,
} from '@/lib/services/parse-pipeline'
import { resolveLocalFilePath } from '@/lib/utils/file-path'
import * as fs from 'fs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 先获取简历信息（B4 修复：将 findUnique 纳入错误处理，避免 DB 异常逃逸为非 JSON 响应）
  let resume
  try {
    resume = await prisma.resume.findUnique({
      where: { id },
      include: {
        email: { select: { subject: true } },
        resumeSource: { select: { subjectPattern: true } },
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '查询简历失败'
    return NextResponse.json({ error: `查询简历失败: ${message}` }, { status: 500 })
  }

  if (!resume) {
    return NextResponse.json({ error: '简历不存在' }, { status: 404 })
  }

  const emailSubjectName = resolveCandidateName(
    resume.email?.subject || null,
    resume.resumeSource?.subjectPattern || null,
    null
  )

  try {
    const body = await request.json().catch(() => ({}))
    const force = body.force === true

    if (!resume.filePath) {
      await prisma.resume.update({
        where: { id },
        data: {
          status: 'ERROR',
          errorMessage: '简历文件路径未记录，无法重新解析',
        },
      })
      return NextResponse.json(
        { error: '简历文件路径未记录，无法重新解析' },
        { status: 400 }
      )
    }

    const localFilePath = resolveLocalFilePath(resume.filePath)

    if (!fs.existsSync(localFilePath)) {
      await prisma.resume.update({
        where: { id },
        data: {
          status: 'ERROR',
          errorMessage: '简历文件不存在，无法重新解析',
        },
      })
      return NextResponse.json(
        { error: '简历文件不存在，无法重新解析' },
        { status: 400 }
      )
    }

    const parseResult = await parseResume(localFilePath, resume.fileType)

    // === 文本质量门禁 ===
    const quality = assertParseQuality(parseResult)
    if (!quality.pass) {
      await prisma.resume.update({
        where: { id },
        data: { status: 'ERROR', candidateName: emailSubjectName, errorMessage: quality.reason },
      })
      return NextResponse.json({ error: quality.reason }, { status: 422 })
    }

    // === 防御纵深：PDF 文字层破碎（spec §6.4） ===
    if (parseResult.hadFragmentation) {
      await prisma.resume.update({
        where: { id },
        data: { status: 'ERROR', candidateName: emailSubjectName, errorMessage: FRAGMENTATION_REASON },
      })
      return NextResponse.json({ error: FRAGMENTATION_REASON }, { status: 422 })
    }

    const candidateName = resolveCandidateName(
      resume.email?.subject || null,
      resume.resumeSource?.subjectPattern || null,
      parseResult.name
    )

    // 如果简历尚未分配职位，自动根据文件名+邮件主题匹配
    const positionMatch = !resume.positionId
      ? await matchPositionForResume(resume.fileName, resume.email?.subject || null)
      : null

    // 确定解析后的状态
    const resolvedStatus = 'PENDING'

    const updated = await prisma.resume.update({
      where: { id },
      data: {
        extractedText: parseResult.text,
        candidateName,
        candidatePhone: parseResult.phone || resume.candidatePhone,
        candidateEmail: parseResult.email || resume.candidateEmail,
        status: force || resume.status === 'ERROR' || resume.status === 'UNPARSED' || resume.status === 'PARSING'
          ? resolvedStatus
          : resume.status,
        ...(positionMatch ? { positionId: positionMatch.positionId } : {}),
      },
    })
    console.log(
      `[NameUpdate] resumeId=${id} field=candidateName source=subject value="${candidateName}" timestamp=${new Date().toISOString()}`
    )

    // 解析成功后自动提取结构化数据
    const saveResult = await saveStructuredData(parseResult.text, {
      resumeId: id,
      logPrefix: '[Reparse]',
      fallbackName: candidateName,
    })

    return NextResponse.json({
      success: true,
      resume: {
        id: updated.id,
        status: updated.status,
        candidateName: updated.candidateName,
        extractedText: updated.extractedText
          ? updated.extractedText.substring(0, 200) + '...'
          : null,
      },
      structured: saveResult.success
        ? { success: true }
        : { success: false, error: saveResult.error },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '解析失败'

    // 解析失败时将简历状态设为异常（errorMessage 为内部诊断信息，写入数据库而非回给客户端）
    try {
      await prisma.resume.update({
        where: { id },
        data: {
          status: 'ERROR',
          candidateName: emailSubjectName,
          errorMessage: `重新解析失败: ${message}`,
        },
      })
    } catch {
      // 状态更新失败不影响错误响应
    }

    return apiErrorResponse(error, '重新解析失败')
  }
}
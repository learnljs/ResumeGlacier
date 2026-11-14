import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiErrorResponse } from '@/lib/services/api-error'
import { refetchSingleEmailByUid } from '@/lib/services/email-fetcher'
import { parseResume, resolveCandidateName } from '@/lib/services/resume-parser'
import { matchPositionForResume } from '@/lib/services/position-matcher'
import {
  assertParseQuality,
  saveStructuredData,
  FRAGMENTATION_REASON,
} from '@/lib/services/parse-pipeline'
import * as fs from 'fs'
import * as path from 'path'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const resume = await prisma.resume.findUnique({
      where: { id },
      include: {
        email: { select: { uid: true, subject: true } },
        resumeSource: { select: { subjectPattern: true } },
      },
    })

    if (!resume) {
      return NextResponse.json({ error: '简历不存在' }, { status: 404 })
    }

    if (!resume.emailId) {
      return NextResponse.json(
        { error: '原始邮件已删除，无法重新获取' },
        { status: 400 }
      )
    }

    if (!resume.emailConfigId) {
      return NextResponse.json(
        { error: '该简历缺少邮件关联信息，无法重新获取' },
        { status: 400 }
      )
    }

    if (!resume.email?.uid) {
      return NextResponse.json(
        { error: '缺少邮件UID信息，无法重新获取' },
        { status: 400 }
      )
    }

    // 从邮箱重新获取邮件
    let fetchResult
    try {
      fetchResult = await refetchSingleEmailByUid(resume.emailConfigId, resume.email.uid)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('该邮件已不存在')) {
        return NextResponse.json({ error: message }, { status: 404 })
      }
      return apiErrorResponse(error, '邮件附件获取失败')
    }

    // 在返回的附件中匹配对应的简历文件
    let attachment = fetchResult.attachments.find(
      (att) => att.filename === resume.fileName
    )
    if (!attachment && fetchResult.attachments.length > 0) {
      attachment = fetchResult.attachments[0]
    }

    if (!attachment) {
      return NextResponse.json(
        { error: '重新获取的邮件中未找到简历附件' },
        { status: 400 }
      )
    }

    if (attachment.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: '附件文件过大(>20MB)' },
        { status: 400 }
      )
    }

    // 保存附件到磁盘
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', resume.emailId)
    fs.mkdirSync(uploadDir, { recursive: true })
    const filePath = path.join(uploadDir, attachment.filename)
    fs.writeFileSync(filePath, attachment.content)

    const fileType = attachment.filename.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'

    // 先从邮件主题提取候选人姓名（异常时兜底使用）
    const emailSubjectName = resolveCandidateName(
      resume.email?.subject || null,
      resume.resumeSource?.subjectPattern || null,
      null
    )

    // 解析简历内容
    let parseResult
    try {
      parseResult = await parseResume(filePath, fileType, {
        emailId: resume.emailId,
        resumeId: resume.id,
      })
    } catch (parseError: unknown) {
      const errMsg = parseError instanceof Error ? parseError.message : '解析失败'
      // 文件已保存成功，但解析失败，更新文件信息并标记错误
      await prisma.resume.update({
        where: { id },
        data: {
          filePath,
          fileName: attachment.filename,
          fileType,
          fileSize: attachment.size,
          status: 'ERROR',
          candidateName: emailSubjectName,
          errorMessage: `重新获取成功但解析失败: ${errMsg}`,
        },
      })
      return NextResponse.json(
        { error: `重新获取成功但解析失败: ${errMsg}` },
        { status: 500 }
      )
    }

    // === 文本质量门禁 ===
    const quality = assertParseQuality(parseResult)
    if (!quality.pass) {
      await prisma.resume.update({
        where: { id },
        data: {
          filePath,
          fileName: attachment.filename,
          fileType,
          fileSize: attachment.size,
          status: 'ERROR',
          candidateName: emailSubjectName,
          errorMessage: quality.reason,
        },
      })
      return NextResponse.json({ error: quality.reason }, { status: 422 })
    }

    // === 防御纵深：PDF 文字层破碎（B6 行为修复：refetch 此前缺失此 gate） ===
    if (parseResult.hadFragmentation) {
      await prisma.resume.update({
        where: { id },
        data: {
          filePath,
          fileName: attachment.filename,
          fileType,
          fileSize: attachment.size,
          status: 'ERROR',
          candidateName: emailSubjectName,
          errorMessage: FRAGMENTATION_REASON,
        },
      })
      return NextResponse.json({ error: FRAGMENTATION_REASON }, { status: 422 })
    }

    const candidateName = resolveCandidateName(
      fetchResult.subject,
      resume.resumeSource?.subjectPattern || null,
      parseResult.name
    )

    // 如果简历尚未分配职位，自动匹配（文件名 + 邮件主题）
    const positionMatch = !resume.positionId
      ? await matchPositionForResume(attachment.filename, fetchResult.subject || null)
      : null

    const resolvedStatus = 'PENDING'

    // 构建 errorMessage（如果有警告）
    const errorMsg =
      parseResult.warnings.length > 0
        ? `[解析警告] 共${parseResult.warnings.length}条:\n${parseResult.warnings.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : null

    const updated = await prisma.resume.update({
      where: { id },
      data: {
        filePath,
        fileName: attachment.filename,
        fileType,
        fileSize: attachment.size,
        extractedText: parseResult.text,
        candidateName,
        candidatePhone: parseResult.phone || resume.candidatePhone,
        candidateEmail: parseResult.email || resume.candidateEmail,
        candidatePhoto: parseResult.photoPath || resume.candidatePhoto,
        parseMethod: parseResult.parseMethod,
        status: resolvedStatus,
        errorMessage: errorMsg,
        ...(positionMatch ? { positionId: positionMatch.positionId } : {}),
      },
    })
    console.log(
      `[NameUpdate] resumeId=${id} field=candidateName source=subject value="${candidateName}" timestamp=${new Date().toISOString()}`
    )

    // 解析成功后自动提取结构化数据
    await saveStructuredData(parseResult.text, {
      resumeId: id,
      logPrefix: '[Refetch]',
      fallbackName: candidateName,
    })

    return NextResponse.json({
      success: true,
      resume: {
        id: updated.id,
        status: updated.status,
        candidateName: updated.candidateName,
        parseMethod: updated.parseMethod,
        extractedText: updated.extractedText
          ? updated.extractedText.substring(0, 200) + '...'
          : null,
      },
    })
  } catch (error: unknown) {
    return apiErrorResponse(error, '重新获取失败')
  }
}
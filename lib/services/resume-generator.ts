import { prisma } from '@/lib/prisma'
import { refetchSingleEmailByUid } from '@/lib/services/email-fetcher'
import * as fs from 'fs'
import * as path from 'path'

function safeFileName(name: string): string {
  return name.replace(/[/\\\0]/g, '-')
}

interface GenerateResult {
  resumes: Array<{ id: string; fileName: string }>
  refetchError: string | null
}

export async function generateResumeForEmail(emailId: string): Promise<GenerateResult> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    select: {
      id: true,
      uid: true,
      fromAddress: true,
      fromName: true,
      subject: true,
      receivedAt: true,
      emailConfigId: true,
      emailConfig: { select: { resumeSourceId: true } },
    },
  })

  if (!email) {
    throw new Error('邮件不存在')
  }

  // 删除旧简历前，先清理关联数据
  const oldResumes = await prisma.resume.findMany({
    where: { emailId },
    select: { id: true },
  })
  const oldResumeIds = oldResumes.map((r) => r.id)

  if (oldResumeIds.length > 0) {
    await prisma.positionEvaluation.deleteMany({
      where: { resumeId: { in: oldResumeIds } },
    })
    await prisma.followUpRecord.deleteMany({
      where: { resumeId: { in: oldResumeIds } },
    })
    await prisma.evaluationDimension.deleteMany({
      where: { resumeId: { in: oldResumeIds } },
    })
  }

  // 删除旧简历
  await prisma.resume.deleteMany({
    where: { emailId },
  })

  const uploadDir = path.join(process.cwd(), 'data', 'uploads', emailId)
  const resumes: Array<{ id: string; fileName: string }> = []
  let refetchError: string | null = null

  // 先尝试从本地已保存的附件文件创建
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir)

    for (const fileName of files) {
      const filePath = path.join(uploadDir, fileName)
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        const fileType = fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'

        const sourceEmailFrom = [email.fromAddress, email.fromName].filter(Boolean).join(' ') || email.fromAddress

        const resume = await prisma.resume.create({
          data: {
            emailId,
            emailConfigId: email.emailConfigId,
            sourceEmailFrom,
            sourceEmailSubject: email.subject,
            sourceEmailReceivedAt: email.receivedAt,
            fileName,
            fileType,
            filePath,
            fileSize: stat.size,
            status: 'UNPARSED',
            resumeSourceId: email.emailConfig?.resumeSourceId,
          },
        })

        resumes.push({ id: resume.id, fileName })
      }
    }
  }

  // 如果本地没有附件文件，尝试从 IMAP 重新抓取邮件附件
  if (resumes.length === 0 && email.uid && email.emailConfigId) {
    try {
      const refetched = await refetchSingleEmailByUid(
        email.emailConfigId,
        email.uid
      )

      if (refetched.attachments.length > 0) {
        fs.mkdirSync(uploadDir, { recursive: true })

        for (const att of refetched.attachments) {
          const safeName = safeFileName(att.filename)
          const filePath = path.join(uploadDir, safeName)
          fs.writeFileSync(filePath, att.content)

          const fileType = safeName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'

          const sourceEmailFrom = [email.fromAddress, email.fromName].filter(Boolean).join(' ') || email.fromAddress

          const resume = await prisma.resume.create({
            data: {
              emailId,
              emailConfigId: email.emailConfigId,
              sourceEmailFrom,
              sourceEmailSubject: email.subject,
              sourceEmailReceivedAt: email.receivedAt,
              fileName: safeName,
              fileType,
              filePath,
              fileSize: att.size,
              status: 'UNPARSED',
              resumeSourceId: email.emailConfig?.resumeSourceId,
            },
          })

          resumes.push({ id: resume.id, fileName: safeName })
        }
      } else {
        refetchError = '邮件中未检测到简历附件（PDF/DOCX）'
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误'
      console.error('IMAP refetch failed for email', emailId, msg)
      refetchError = `IMAP 重新抓取失败: ${msg}`
    }
  } else if (resumes.length === 0 && !email.emailConfigId) {
    refetchError = '邮件缺少邮箱配置关联，无法重新抓取'
  }

  return { resumes, refetchError }
}

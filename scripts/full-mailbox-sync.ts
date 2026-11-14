/**
 * 全量邮箱同步脚本（同步 + 解析，含OCR，跳过结构化提取和筛选）
 *
 * 以邮箱为准同步 Email/Resume 记录，保存附件到磁盘，解析简历
 * 结构化提取和筛选由后续 batch API / 页面按钮完成
 *
 * 用法：
 *   npx tsx scripts/full-mailbox-sync.ts                        # 同步第一个邮箱配置
 *   npx tsx scripts/full-mailbox-sync.ts <configId>             # 清空指定邮箱数据 → 全量同步 + 解析
 *   npx tsx scripts/full-mailbox-sync.ts <configId> --no-clear  # 不清空，直接同步
 *   npx tsx scripts/full-mailbox-sync.ts <configId> --yes       # 跳过清空确认（非交互终端必须显式加）
 *
 * ⚠️ 默认行为是「清空该邮箱的全部邮件/简历后再同步」，会级联删除评估、跟进记录
 *    并删除 data/uploads/ 下的简历原文件，不可撤销。因此清空前必须交互确认
 *    （输入 yes）；非交互终端（管道 / CI）默认拒绝，需显式加 --yes。
 */

import { PrismaClient } from '@prisma/client'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import * as readline from 'readline'
import { decrypt } from '../lib/services/encryption'
import { parseResume, resolveCandidateName } from '../lib/services/resume-parser'
import { matchPositionByFileName, matchPositionBySubject } from '../lib/services/position-matcher'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const QUALITY_THRESHOLD = 40
const MIN_TEXT_LENGTH = 50

const RESUME_EXTENSIONS = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png']
const RESUME_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
]

function isResumeAttachment(att: any): boolean {
  const fn = att.filename?.toLowerCase() || ''
  const ct = att.contentType?.toLowerCase() || ''
  return RESUME_EXTENSIONS.some(ext => fn.endsWith(ext)) ||
    RESUME_CONTENT_TYPES.some(type => ct.startsWith(type))
}

function getFileType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.doc')) return 'doc'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg'
  if (lower.endsWith('.png')) return 'png'
  return 'pdf'
}

function safeFileName(name: string): string {
  return name.replace(/[/\\\0]/g, '-')
}

/** 统计该邮箱配置下将被清空的邮件 / 简历数量（用于清空前警告） */
async function countConfigData(configId: string) {
  const emails = await prisma.email.findMany({
    where: { emailConfigId: configId },
    select: { id: true },
  })
  const emailIds = emails.map(e => e.id)
  const resumes = emailIds.length === 0
    ? 0
    : await prisma.resume.count({ where: { emailId: { in: emailIds } } })
  return { emails: emailIds.length, resumes }
}

/** 交互式确认：必须输入完整的 yes 才视为确认（回车 / y / 其它一律中止） */
async function confirmDangerous(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve))
    return answer.trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

async function clearConfigData(configId: string) {
  console.log('\n--- 清空旧数据 ---')
  const oldEmails = await prisma.email.findMany({
    where: { emailConfigId: configId },
    select: { id: true },
  })
  const emailIds = oldEmails.map(e => e.id)

  if (emailIds.length === 0) {
    console.log('无旧数据需要清空')
    return
  }

  const resumes = await prisma.resume.findMany({
    where: { emailId: { in: emailIds } },
    select: { id: true, filePath: true, emailId: true },
  })
  const resumeIds = resumes.map(r => r.id)

  if (resumeIds.length > 0) {
    await prisma.positionEvaluation.deleteMany({ where: { resumeId: { in: resumeIds } } })
    await prisma.followUpLog.deleteMany({ where: { followUpRecord: { resumeId: { in: resumeIds } } } })
    await prisma.followUpRecord.deleteMany({ where: { resumeId: { in: resumeIds } } })
    await prisma.evaluationDimension.deleteMany({ where: { resumeId: { in: resumeIds } } })
  }

  const dr = await prisma.resume.deleteMany({ where: { emailId: { in: emailIds } } })

  for (const r of resumes) {
    if (r.filePath && fs.existsSync(r.filePath)) {
      try { fs.unlinkSync(r.filePath) } catch {}
    }
    if (r.emailId) {
      const uploadDir = path.join(process.cwd(), 'data', 'uploads', r.emailId)
      if (fs.existsSync(uploadDir)) {
        try { fs.rmSync(uploadDir, { recursive: true, force: true }) } catch {}
      }
    }
  }

  const de = await prisma.email.deleteMany({ where: { id: { in: emailIds } } })
  console.log(`已清空: ${de.count} 封邮件, ${dr.count} 份简历`)
}

async function main() {
  const configId = process.argv[2]
  const noClear = process.argv.includes('--no-clear')
  const assumeYes = process.argv.includes('--yes')

  if (!configId) {
    console.log('用法: npx tsx scripts/full-mailbox-sync.ts <configId> [--no-clear] [--yes]')
    console.log('\n可用的邮箱配置:')
    const configs = await prisma.emailConfig.findMany({ select: { id: true, alias: true, host: true } })
    for (const c of configs) {
      console.log(`  ${c.id}  ${c.alias} (${c.host})`)
    }
    await prisma.$disconnect()
    return
  }

  console.log('=== 全量邮箱同步（同步 + 解析）===\n')

  const config = await prisma.emailConfig.findUnique({
    where: { id: configId },
    include: { resumeSource: { select: { id: true, subjectPattern: true } } },
  })
  if (!config) { console.log(`未找到邮箱配置: ${configId}`); return }
  console.log(`邮箱: ${config.alias} (${config.host}) [${config.id}]`)

  // 清空旧数据（危险操作：级联删除 + 删磁盘文件，必须先确认）
  if (!noClear) {
    const { emails, resumes } = await countConfigData(config.id)
    console.log('\n⚠️  即将清空该邮箱的旧数据，此操作不可撤销：')
    console.log(`   • 删除邮件 ${emails} 封、简历 ${resumes} 份（含其评估与跟进记录）`)
    console.log('   • 同时删除 data/uploads/<emailId>/ 下的简历原文件')
    console.log('   • 之后从邮箱全量重新同步 + 解析')

    if (!assumeYes) {
      if (!process.stdin.isTTY) {
        console.log('\n❌ 非交互终端：默认中止。')
        console.log('   如确认要清空，请显式加 --yes；或加 --no-clear 跳过清空直接同步。')
        await prisma.$disconnect()
        process.exit(1)
      }
      const ok = await confirmDangerous('\n确认清空请输入 yes（其它任意输入即中止）: ')
      if (!ok) {
        console.log('已中止，未清空任何数据。')
        await prisma.$disconnect()
        return
      }
    }

    await clearConfigData(config.id)
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: decrypt(config.password) },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 16000,
  })

  await client.connect()
  console.log('\n✅ 邮箱连接成功\n')

  let emailCount = 0, resumeCreated = 0, parseSuccess = 0, parseFailed = 0, skipped = 0, errors = 0
  const mailboxMessageIds = new Set<string>()

  const lock = await client.getMailboxLock(config.mailbox)
  try {
    const messages = client.fetch({ uid: '1:*' }, { source: true, uid: true })

    for await (const msg of messages) {
      if (!msg.source) { skipped++; continue }

      try {
        const parsed = await simpleParser(msg.source)
        const messageId = parsed.messageId || `uid-${msg.uid}-${Date.now()}`
        mailboxMessageIds.add(messageId)
        emailCount++

        const resumeAttachments = (parsed.attachments || []).filter(isResumeAttachment)

        if (resumeAttachments.length === 0) continue

        const subject = parsed.subject || '(无主题)'
        const fromAddress = parsed.from?.value?.[0]?.address || 'unknown'
        const fromName = parsed.from?.value?.[0]?.name || null
        const receivedAt = parsed.date || new Date()

        // 创建 Email
        const emailRecord = await prisma.email.create({
          data: {
            messageId,
            uid: String(msg.uid),
            fromAddress,
            fromName,
            subject,
            receivedAt,
            emailConfigId: config.id,
          },
        })

        // 处理附件
        for (const att of resumeAttachments) {
          try {
            const uploadDir = path.join(process.cwd(), 'data', 'uploads', emailRecord.id)
            fs.mkdirSync(uploadDir, { recursive: true })
            const safeName = safeFileName(att.filename || `attachment-${Date.now()}`)
            const filePath = path.join(uploadDir, safeName)
            fs.writeFileSync(filePath, att.content)
            const fileType = getFileType(safeName)

            const sourceEmailFrom = [fromAddress, fromName].filter(Boolean).join(' ') || fromAddress

            const newResume = await prisma.resume.create({
              data: {
                emailId: emailRecord.id,
                emailConfigId: config.id,
                resumeSourceId: config.resumeSourceId,
                sourceEmailFrom,
                sourceEmailSubject: subject,
                sourceEmailReceivedAt: receivedAt,
                fileName: safeName,
                fileType,
                filePath,
                fileSize: att.size || att.content.length,
                status: 'PARSING',
              },
            })
            resumeCreated++

            // 解析简历（含OCR）
            try {
              const parseResult = await parseResume(filePath, fileType)
              const textLength = parseResult.text?.trim().length || 0

              if (parseResult.textQualityScore < QUALITY_THRESHOLD || textLength < MIN_TEXT_LENGTH || parseResult.isGarbled) {
                const reason = textLength < MIN_TEXT_LENGTH ? `文本过短(${textLength})` : `质量不合格(${parseResult.textQualityScore})`
                await prisma.resume.update({
                  where: { id: newResume.id },
                  data: { status: 'ERROR', candidateName: resolveCandidateName(subject, config.resumeSource?.subjectPattern || null, null), errorMessage: reason },
                })
                parseFailed++
              } else {
                const candidateName = resolveCandidateName(subject, config.resumeSource?.subjectPattern || null, parseResult.name)
                const positionMatch = (await matchPositionByFileName(safeName)) ||
                  (subject ? await matchPositionBySubject(subject) : null)
                const resolvedStatus = 'PENDING'

                await prisma.resume.update({
                  where: { id: newResume.id },
                  data: {
                    extractedText: parseResult.text, candidateName,
                    candidatePhone: parseResult.phone, candidateEmail: parseResult.email,
                    candidatePhoto: parseResult.photoPath, parseMethod: parseResult.parseMethod,
                    status: resolvedStatus,
                    errorMessage: parseResult.warnings.length > 0 ? `[警告]${parseResult.warnings.length}条` : null,
                    ...(positionMatch ? { positionId: positionMatch.positionId } : {}),
                  },
                })
                parseSuccess++
              }
            } catch {
              await prisma.resume.update({
                where: { id: newResume.id },
                data: { status: 'ERROR', errorMessage: '解析异常' },
              })
              parseFailed++
            }
          } catch {
            errors++
          }
        }

        if (emailCount % 100 === 0) {
          console.log(`进度: ${emailCount} 封邮件 (新建:${resumeCreated} 解析:${parseSuccess} 解析失败:${parseFailed} 错误:${errors})`)
        }
      } catch {
        errors++
      }
    }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }

  // 更新 lastFetchedUid
  await prisma.emailConfig.update({
    where: { id: config.id },
    data: { lastFetchedUid: null, lastFetchedAt: new Date() },
  })

  console.log(`\n${'='.repeat(50)}`)
  console.log(`同步完成`)
  console.log(`${'='.repeat(50)}`)
  console.log(`邮件总数:     ${emailCount}`)
  console.log(`创建 Resume:  ${resumeCreated}`)
  console.log(`解析成功:     ${parseSuccess}`)
  console.log(`解析失败:     ${parseFailed}`)
  console.log(`跳过(无源码): ${skipped}`)
  console.log(`错误:         ${errors}`)

  await prisma.$disconnect()
}

main().catch(console.error).finally(() => prisma.$disconnect())

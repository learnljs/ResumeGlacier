import { ImapFlow, type SearchObject } from 'imapflow'
import { simpleParser, type Attachment } from 'mailparser'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/services/encryption'

/**
 * 解密邮箱密码。
 * 直接抛 crypto 的「Invalid initialization vector」对使用者毫无意义，
 * 这里换成可以直接照做的提示（演示邮箱正是命中这一支）。
 */
function decryptPassword(stored: string | null | undefined): string {
  if (!stored) {
    throw new Error('邮箱密码未配置，请到「系统配置 · 邮箱」重新填写密码')
  }
  try {
    return decrypt(stored)
  } catch {
    throw new Error('邮箱密码无法解密（可能加密密钥已变更），请到「系统配置 · 邮箱」重新填写密码')
  }
}
import { createBatch, updateBatchProgress } from '@/lib/services/task-batch-service'
import * as fs from 'fs'
import * as path from 'path'
import { safeAttachmentName } from '@/lib/utils/file-path'

interface FetchResult {
  fetched: number
  generated: number
  errors: number
  duplicatesSkipped: number
  errorMessages: string[]
  newResumeIds: string[]
}

interface MultiFetchResult {
  total: FetchResult
  perConfig: Array<{
    configId: string
    alias: string
    result: FetchResult | null
    error?: string
  }>
  batchId?: string
  batchNo?: string
}

export async function testImapConnection(config: {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}): Promise<{ success: boolean; message: string }> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  })

  try {
    await client.connect()
    // 只 connect 成功还不足以证明「能收简历」：再读一次文件夹列表，
    // 确认认证后的 IMAP 会话真的可操作，而不是刚握手就被拒。
    const mailboxes = await client.list()
    const folderCount = Array.isArray(mailboxes) ? mailboxes.length : 0
    return {
      success: true,
      message: `连接成功：服务器可达、账号认证通过，已读取到 ${folderCount} 个邮件文件夹`,
    }
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : '未知错误'
    let message: string

    if (rawMessage.includes('ETIMEDOUT') || rawMessage.includes('ENOTFOUND') || rawMessage.includes('ECONNREFUSED')) {
      message = `无法连接到服务器 ${config.host}:${config.port}，请检查服务器地址和端口是否正确，以及网络是否可达`
    } else if (rawMessage.includes('certificate') || rawMessage.includes('TLS') || rawMessage.includes('SSL') || rawMessage.includes('self signed')) {
      message = `TLS/SSL 连接失败：${rawMessage}。请检查是否启用了 SSL/TLS，或尝试切换安全连接选项`
    } else if (rawMessage.includes('authentication') || rawMessage.includes('AUTH') || rawMessage.includes('LOGIN') || rawMessage.includes('password') || rawMessage.includes('Invalid credentials')) {
      message = `认证失败：用户名或密码错误。请确认邮箱地址和密码/授权码是否正确`
    } else if (rawMessage.includes('timeout')) {
      message = `连接超时：服务器 ${config.host}:${config.port} 无响应，请检查网络连接或防火墙设置`
    } else {
      message = `IMAP连接失败: ${rawMessage}`
    }

    return { success: false, message }
  } finally {
    // 无论成功失败都断开，避免测试按钮点几次就留下挂着的连接
    try {
      await client.logout()
    } catch {
      // 连接已经断开或未建立，忽略即可
    }
  }
}

export interface ImapFolder {
  path: string
  name: string
  delimiter: string
  specialUse: string | undefined
}

export async function listImapFolders(config: {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}): Promise<{ success: boolean; folders?: ImapFolder[]; message?: string }> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  })

  try {
    await client.connect()
    const listResult = await client.list()
    await client.logout()

    const folders: ImapFolder[] = listResult
      .filter((f) => f.listed)
      .map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        specialUse: f.specialUse,
      }))

    return { success: true, folders }
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : '未知错误'
    let message: string

    if (rawMessage.includes('ETIMEDOUT') || rawMessage.includes('ENOTFOUND') || rawMessage.includes('ECONNREFUSED')) {
      message = `无法连接到服务器 ${config.host}:${config.port}，请检查服务器地址和端口是否正确`
    } else if (rawMessage.includes('authentication') || rawMessage.includes('AUTH') || rawMessage.includes('Invalid credentials')) {
      message = `认证失败：用户名或密码错误，请确认后重试`
    } else {
      message = `获取文件夹列表失败: ${rawMessage}`
    }

    return { success: false, message }
  }
}

async function fetchEmailsForConfig(configId: string, full = false): Promise<FetchResult> {
  const config = await prisma.emailConfig.findUnique({
    where: { id: configId },
    include: {
      resumeSource: { select: { id: true, subjectPattern: true } },
    },
  })

  if (!config || !config.isActive) {
    throw new Error('邮箱配置不存在或已禁用')
  }

  const result: FetchResult = {
    fetched: 0,
    generated: 0,
    errors: 0,
    duplicatesSkipped: 0,
    errorMessages: [],
    newResumeIds: [],
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: decryptPassword(config.password),
    },
    logger: false,
    // 默认空闲超时 5 分钟：主机名填错或服务器不可达时，手动收取会长时间转圈。
    // 收紧到 30 秒，正常同步（持续有数据流动）不受影响，失败能尽快给出提示。
    socketTimeout: 30_000,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(config.mailbox)

    try {
      let searchCriteria: SearchObject
      if (full) {
        searchCriteria = { uid: '1:*' }
      } else if (config.lastFetchedUid) {
        searchCriteria = { uid: `${config.lastFetchedUid}:*` }
      } else {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        searchCriteria = { since: sevenDaysAgo }
      }

      const messages = client.fetch(searchCriteria, {
        envelope: true,
        source: true,
        uid: true,
      })

      let maxUid = config.lastFetchedUid || '0'

      for await (const msg of messages) {
        try {
          const uidStr = String(msg.uid)

          if (config.lastFetchedUid && uidStr === config.lastFetchedUid) {
            continue
          }

          if (parseInt(uidStr) > parseInt(maxUid)) {
            maxUid = uidStr
          }

          if (!msg.source) {
            result.errors++
            result.errorMessages.push(`UID ${uidStr}: 无法获取邮件源码`)
            continue
          }
          const parsed = await simpleParser(msg.source)
          const messageId = parsed.messageId || `uid-${uidStr}-${Date.now()}`

          const existing = await prisma.email.findUnique({
            where: { messageId },
          })
          if (existing) {
            result.duplicatesSkipped++
            continue
          }

          const resumeAttachments = (parsed.attachments || []).filter((att: Attachment) => {
            const filename = att.filename?.toLowerCase() || ''
            return (
              filename.endsWith('.pdf') ||
              filename.endsWith('.docx') ||
              att.contentType === 'application/pdf' ||
              att.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            )
          })

          if (resumeAttachments.length === 0) {
            continue
          }

          result.fetched++

          const emailRecord = await prisma.email.create({
            data: {
              messageId,
              uid: uidStr,
              fromAddress: parsed.from?.value?.[0]?.address || 'unknown',
              fromName: parsed.from?.value?.[0]?.name || null,
              subject: parsed.subject || '(无主题)',
              receivedAt: parsed.date || new Date(),
              emailConfigId: config.id,
            },
          })

          for (const att of resumeAttachments) {
            try {
              const uploadDir = path.join(process.cwd(), 'data', 'uploads', emailRecord.id)
              fs.mkdirSync(uploadDir, { recursive: true })
              const safeName = safeAttachmentName(att.filename, `attachment-${Date.now()}`)
              const filePath = path.join(uploadDir, safeName)
              fs.writeFileSync(filePath, att.content)

              const fileType = safeName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'

              const sourceEmailFrom = [emailRecord.fromAddress, emailRecord.fromName].filter(Boolean).join(' ') || emailRecord.fromAddress

              const newResume = await prisma.resume.create({
                data: {
                  emailId: emailRecord.id,
                  emailConfigId: config.id,
                  resumeSourceId: config.resumeSourceId,
                  sourceEmailFrom,
                  sourceEmailSubject: emailRecord.subject,
                  sourceEmailReceivedAt: emailRecord.receivedAt,
                  fileName: safeName,
                  fileType,
                  filePath,
                  fileSize: att.size || att.content.length,
                  status: 'UNPARSED',
                },
              })

              result.newResumeIds.push(newResume.id)
              result.generated++
            } catch (attError: unknown) {
              result.errors++
              const errMsg = attError instanceof Error ? attError.message : '未知错误'
              result.errorMessages.push(`附件处理失败: ${errMsg}`)
            }
          }
        } catch (msgError: unknown) {
          result.errors++
          const errMsg = msgError instanceof Error ? msgError.message : '未知错误'
          result.errorMessages.push(`邮件处理失败: ${errMsg}`)
        }
      }

      if (maxUid !== '0') {
        await prisma.emailConfig.update({
          where: { id: config.id },
          data: {
            lastFetchedUid: maxUid,
            lastFetchedAt: new Date(),
          },
        })
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(`邮件获取失败: ${message}`)
  }

  return result
}

export interface RefetchResult {
  subject: string
  fromAddress: string
  fromName: string | null
  attachments: Array<{
    filename: string
    content: Buffer
    contentType: string
    size: number
  }>
}

export async function refetchSingleEmailByUid(
  emailConfigId: string,
  uid: string
): Promise<RefetchResult> {
  const config = await prisma.emailConfig.findUnique({
    where: { id: emailConfigId },
  })

  if (!config) {
    throw new Error('邮箱配置不存在')
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: decryptPassword(config.password),
    },
    logger: false,
    // 默认空闲超时 5 分钟：主机名填错或服务器不可达时，手动收取会长时间转圈。
    // 收紧到 30 秒，正常同步（持续有数据流动）不受影响，失败能尽快给出提示。
    socketTimeout: 30_000,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(config.mailbox)

    try {
      const messages = client.fetch({ uid }, { source: true, uid: true })

      let found = false
      let result: RefetchResult | null = null

      for await (const msg of messages) {
        if (!msg.source) {
          throw new Error('无法获取邮件源码')
        }

        found = true
        const parsed = await simpleParser(msg.source)

        const resumeAttachments = (parsed.attachments || []).filter((att: Attachment) => {
          const filename = att.filename?.toLowerCase() || ''
          return (
            filename.endsWith('.pdf') ||
            filename.endsWith('.docx') ||
            att.contentType === 'application/pdf' ||
            att.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          )
        })

        result = {
          subject: parsed.subject || '(无主题)',
          fromAddress: parsed.from?.value?.[0]?.address || 'unknown',
          fromName: parsed.from?.value?.[0]?.name || null,
          attachments: resumeAttachments.map((att: Attachment) => ({
            filename: att.filename || `attachment-${Date.now()}`,
            content: att.content,
            contentType: att.contentType,
            size: att.size || att.content.length,
          })),
        }
        break
      }

      if (!found || !result) {
        throw new Error(`该邮件已不存在于邮箱中（UID: ${uid}），可能已被删除或移动`)
      }

      return result
    } finally {
      lock.release()
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('该邮件已不存在')) {
      throw error
    }
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(`连接邮箱失败: ${message}`)
  } finally {
    try {
      await client.logout()
    } catch {}
  }
}

export async function fetchEmails(
  configId?: string,
  full = false,
  batchSource?: 'scheduled' | 'manual',
  sourceDetail?: string
): Promise<MultiFetchResult> {
  let configs: Array<{ id: string; alias: string }>

  if (configId) {
    const config = await prisma.emailConfig.findUnique({
      where: { id: configId },
      select: { id: true, alias: true },
    })
    if (!config) {
      throw new Error('邮箱配置不存在')
    }
    configs = [config]
  } else {
    configs = await prisma.emailConfig.findMany({
      where: { isActive: true },
      select: { id: true, alias: true },
    })
  }

  if (configs.length === 0) {
    throw new Error('未找到有效的邮箱配置，请先配置IMAP设置')
  }

  const total: FetchResult = {
    fetched: 0,
    generated: 0,
    errors: 0,
    duplicatesSkipped: 0,
    errorMessages: [],
    newResumeIds: [],
  }

  const perConfig: MultiFetchResult['perConfig'] = []

  for (const cfg of configs) {
    try {
      const result = await fetchEmailsForConfig(cfg.id, full)
      total.fetched += result.fetched
      total.generated += result.generated
      total.errors += result.errors
      total.duplicatesSkipped += result.duplicatesSkipped
      total.errorMessages.push(...result.errorMessages)
      total.newResumeIds.push(...result.newResumeIds)
      perConfig.push({ configId: cfg.id, alias: cfg.alias, result })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '未知错误'
      total.errors++
      total.errorMessages.push(`[${cfg.alias}] ${msg}`)
      perConfig.push({ configId: cfg.id, alias: cfg.alias, result: null, error: msg })
    }
  }

  // 如果有新简历且指定了批次来源，创建批次记录
  if (batchSource && total.newResumeIds.length > 0) {
    try {
      const batch = await createBatch({
        source: batchSource,
        sourceDetail: sourceDetail || (batchSource === 'scheduled' ? '定时任务' : '手动获取'),
        emailConfigId: configId,
        resumeIds: total.newResumeIds,
      })

      // 更新批次进度
      await updateBatchProgress(batch.id)

      return { total, perConfig, batchId: batch.id, batchNo: batch.batchNo }
    } catch (batchError) {
      console.error('创建批次记录失败:', batchError)
      // 批次创建失败不影响主流程
    }
  }

  return { total, perConfig }
}

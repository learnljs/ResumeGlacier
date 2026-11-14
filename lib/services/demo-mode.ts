/**
 * 演示模式
 *
 * 目的：仓库 clone 下来、数据库是空的时候，打开页面就能看到完整效果，
 * 而不是一堆空状态卡片。演示数据全部虚构，且带一个可逆的「退出演示」出口。
 *
 * 判定方式：数据库文件旁的 `<db>.demo` 标记文件（默认 `prisma/data/resume.db.demo`）。
 * 为什么用文件而不是数据库字段：标记本身要和「数据是否存在」解耦——
 * 用户删了演示数据后标记也要一起消失，文件语义最直接，也不用为它加一张表。
 */
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'

const DEFAULT_MARKER = path.join(process.cwd(), 'prisma', 'data', '.demo-mode')

/**
 * 标记文件跟着数据库走（`<db 文件>.demo`），而不是写死一个目录。
 * 这样切换 DATABASE_URL（比如临时库、测试库）时不会互相误判演示状态。
 */
function markerPath(): string {
  const url = process.env.DATABASE_URL ?? ''
  const matched = url.match(/^file:(.+)$/)
  if (!matched) return DEFAULT_MARKER

  const raw = matched[1]
  // Prisma 的相对路径以 schema.prisma 所在目录（prisma/）为基准
  const abs = path.isAbsolute(raw) ? raw : path.join(process.cwd(), 'prisma', raw)
  return `${abs}.demo`
}

export interface DemoStatus {
  /** 当前是否处于演示模式 */
  demo: boolean
  /** 演示数据规模，用于横幅文案 */
  counts: { resumes: number; positions: number; followUps: number }
}

async function markerExists(): Promise<boolean> {
  try {
    await fs.access(markerPath())
    return true
  } catch {
    return false
  }
}

async function writeMarker() {
  const target = markerPath()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, new Date().toISOString(), 'utf8')
}

async function removeMarker() {
  await fs.rm(markerPath(), { force: true })
}

/**
 * 「用户主动退出过演示」的标记。
 *
 * 没有它的话，用户点完「删除演示数据」、库变空的瞬间，下一次拉状态又会自动播种，
 * 变成删不掉；有这个标记就永久不再自动灌数据。
 */
function optOutPath(): string {
  return `${markerPath()}.optout`
}

async function hasOptedOut(): Promise<boolean> {
  try {
    await fs.access(optOutPath())
    return true
  } catch {
    return false
  }
}

/** 库里是否已经有简历；有就不该再灌演示数据 */
async function hasResumes(): Promise<boolean> {
  const count = await prisma.resume.count()
  return count > 0
}

export async function getDemoStatus(): Promise<DemoStatus> {
  const [demo, resumes, positions, followUps] = await Promise.all([
    markerExists(),
    prisma.resume.count(),
    prisma.position.count(),
    prisma.followUpRecord.count(),
  ])
  return { demo, counts: { resumes, positions, followUps } }
}

// -------------------------------------------------------
// 演示数据
// -------------------------------------------------------

const POSITIONS = [
  {
    title: '高级前端工程师',
    department: '研发',
    description: '负责 Web 端核心功能与性能优化',
    requirements: 'React / Next.js 5 年以上，有性能优化与工程化落地经验',
  },
  {
    title: '全栈工程师',
    department: '研发',
    description: '负责产品全链路开发，前后端一体',
    requirements: 'Node.js + 前端 3 年以上，能独立交付模块',
  },
  {
    title: '产品设计师',
    department: '设计',
    description: '负责产品 UX / UI 与设计规范',
    requirements: 'Figma、交互原型、设计系统建设经验',
  },
]

interface DemoResume {
  name: string
  email: string
  phone: string
  fileName: string
  position: string
  status: 'UNPARSED' | 'PENDING' | 'SCREENING' | 'SCREENED' | 'ERROR'
  initialScore: number | null
  compositeScore: number | null
  /** 距今天数，用于把数据摊在近一周，让趋势图有起伏 */
  daysAgo: number
  subject: string
  errorMessage?: string
  /** 有值则生成评估记录与跟进记录 */
  evaluation?: {
    summary: string
    strengths: string[]
    weaknesses: string[]
    tags: string[]
  }
  followUp?: {
    status: 'CONTACTING' | 'INTERVIEW_SCHEDULED' | 'INTERVIEWED' | 'OFFER_SENT' | 'UNSUITABLE'
    contacted: 'NOT_CONTACTED' | 'CONTACTED' | 'CONTACT_FAILED'
    note?: string
    interviewTime?: string
    rejectReason?: string
  }
}

const RESUMES: DemoResume[] = [
  {
    name: '张伟', email: 'zhangwei@example.com', phone: '13800000001', fileName: '张伟-高级前端工程师.pdf',
    position: '高级前端工程师', status: 'SCREENED', initialScore: 90, compositeScore: 83, daysAgo: 0,
    subject: '应聘：高级前端工程师',
    evaluation: {
      summary: '6 年前端经验，主导过 3 个百万级 DAU 产品的性能优化，工程化体系搭建完整。',
      strengths: ['性能优化有量化结果，首屏 2.4s → 0.9s', '组件库与脚手架落地到 12 条业务线', '监控体系从 0 到 1'],
      weaknesses: ['缺少跨端（小程序 / RN）项目经验', '团队管理经验偏少'],
      tags: ['React', '性能优化', '工程化'],
    },
    followUp: { status: 'INTERVIEW_SCHEDULED', contacted: 'CONTACTED', interviewTime: '2026-11-18 14:00', note: '一面已约，重点问性能优化方案' },
  },
  {
    name: '李娜', email: 'lina@example.com', phone: '13800000002', fileName: '李娜-全栈开发.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 78, compositeScore: 74, daysAgo: 0,
    subject: '社招投递 - 全栈工程师',
    evaluation: {
      summary: '4 年全栈经验，前后端都能独立交付，SQL 与接口设计扎实。',
      strengths: ['独立交付 6 个业务模块', '有 Postgres 慢查询治理经验'],
      weaknesses: ['前端动效与设计还原度一般'],
      tags: ['Node.js', 'TypeScript', 'Postgres'],
    },
    followUp: { status: 'CONTACTING', contacted: 'CONTACTED', note: '已发面试邀约，等回复' },
  },
  {
    name: '王强', email: 'wangqiang@example.com', phone: '13800000003', fileName: '王强-产品设计.pdf',
    position: '产品设计师', status: 'SCREENED', initialScore: 88, compositeScore: 81, daysAgo: 1,
    subject: '应聘产品设计师 - 简历',
    evaluation: {
      summary: '5 年 B 端设计经验，主导过设计系统建设，业务理解能力强。',
      strengths: ['设计系统从 0 到 1，覆盖 40+ 组件', '能独立做用户访谈与需求拆解'],
      weaknesses: ['C 端增长类项目经验较少'],
      tags: ['Figma', '设计系统', 'B 端'],
    },
    followUp: { status: 'INTERVIEWED', contacted: 'CONTACTED', note: '二面已过，等作品集补充' },
  },
  {
    name: '刘洋', email: 'liuyang@example.com', phone: '13800000004', fileName: '刘洋-前端工程师.pdf',
    position: '高级前端工程师', status: 'SCREENED', initialScore: 62, compositeScore: 58, daysAgo: 2,
    subject: 'Re: 前端工程师职位申请',
    evaluation: {
      summary: '3 年前端经验，业务开发熟练，但缺少复杂场景与性能优化沉淀。',
      strengths: ['业务迭代速度快，能快速上手新框架'],
      weaknesses: ['无性能优化量化案例', '技术深度不足'],
      tags: ['Vue', '业务开发'],
    },
    followUp: { status: 'UNSUITABLE', contacted: 'CONTACTED', rejectReason: '技术深度与岗位要求不匹配' },
  },
  {
    name: '陈静', email: 'chenjing@example.com', phone: '13800000005', fileName: '陈静-后端开发.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 85, compositeScore: 80, daysAgo: 3,
    subject: '求职：全栈开发工程师',
    evaluation: {
      summary: '5 年后端为主的全栈，服务拆分与稳定性建设经验突出。',
      strengths: ['主导过一次单体到微服务的拆分', '线上事故复盘机制建设'],
      weaknesses: ['前端工程化经验偏弱'],
      tags: ['Java', '微服务', '稳定性'],
    },
    followUp: { status: 'OFFER_SENT', contacted: 'CONTACTED', note: '已发 offer，薪资待确认' },
  },
  {
    name: '赵磊', email: 'zhaolei@example.com', phone: '13800000006', fileName: '赵磊-全栈.pdf',
    position: '全栈工程师', status: 'PENDING', initialScore: null, compositeScore: null, daysAgo: 3,
    subject: '投递简历 - 全栈',
  },
  {
    name: '孙婷', email: 'sunting@example.com', phone: '13800000007', fileName: '孙婷-UI设计师.pdf',
    position: '产品设计师', status: 'SCREENING', initialScore: null, compositeScore: null, daysAgo: 3,
    subject: '应聘产品设计师',
  },
  {
    name: '周浩', email: 'zhouhao@example.com', phone: '13800000008', fileName: '周浩-前端.pdf',
    position: '高级前端工程师', status: 'ERROR', initialScore: null, compositeScore: null, daysAgo: 4,
    subject: '应聘前端工程师', errorMessage: 'PDF 解析失败：文件已加密，无法提取文本',
  },
  {
    name: '吴敏', email: 'wumin@example.com', phone: '13800000009', fileName: '吴敏-前端开发.pdf',
    position: '高级前端工程师', status: 'UNPARSED', initialScore: null, compositeScore: null, daysAgo: 4,
    subject: '求职申请 - 前端开发',
  },
  {
    name: '郑伟', email: 'zhengwei@example.com', phone: '13800000010', fileName: '郑伟-全栈工程师.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 71, compositeScore: 68, daysAgo: 5,
    subject: '全栈工程师申请',
    evaluation: {
      summary: '4 年经验，业务覆盖广，深度项目经验一般。',
      strengths: ['多技术栈都能上手', '沟通与协作评价好'],
      weaknesses: ['缺少长期维护的大型项目'],
      tags: ['Node.js', 'React'],
    },
    followUp: { status: 'CONTACTING', contacted: 'CONTACT_FAILED', note: '电话未接通，明天再试' },
  },
  {
    name: '冯雪', email: 'fengxue@example.com', phone: '13800000011', fileName: '冯雪-产品设计.pdf',
    position: '产品设计师', status: 'PENDING', initialScore: null, compositeScore: null, daysAgo: 5,
    subject: '产品设计师应聘 - 作品集附后',
  },
  {
    name: '许凯', email: 'xukai@example.com', phone: '13800000012', fileName: '许凯-前端.pdf',
    position: '高级前端工程师', status: 'SCREENED', initialScore: 66, compositeScore: 63, daysAgo: 6,
    subject: '应聘：前端开发',
    evaluation: {
      summary: '3 年前端，偏业务交付，工程化参与度低。',
      strengths: ['交付稳定，代码规范'],
      weaknesses: ['无复杂项目主导经验'],
      tags: ['React', '业务开发'],
    },
  },
]

const INITIAL_WEIGHTS = { knowledge: 50, skill: 50 }
const ICEBERG_WEIGHTS = {
  knowledge: 15,
  skill: 15,
  selfAwareness: 20,
  personality: 20,
  values: 15,
  motivation: 15,
}

/**
 * 写入演示数据。
 *
 * 已经有简历时直接跳过——避免用户第二次打开系统被重复灌数据；
 * 返回 false 表示「没写」，调用方据此决定要不要打标记。
 */
export async function seedDemoData(): Promise<boolean> {
  if (await hasResumes()) return false

  const source = await prisma.resumeSource.create({
    data: { name: '演示数据源', description: '演示用简历来源，接入真实邮箱后可删除' },
  })

  // 演示邮箱故意不填密码：它连不上任何服务器，但列表、筛选、统计都能正常演示
  const mailbox = await prisma.emailConfig.create({
    data: {
      id: 'demo-email-config',
      alias: 'demo@example.com',
      host: 'imap.example.com',
      port: 993,
      user: 'demo@example.com',
      password: '',
      resumeSourceId: source.id,
    },
  })

  const positionMap = new Map<string, string>()
  for (const p of POSITIONS) {
    const pos = await prisma.position.create({ data: p })
    positionMap.set(p.title, pos.id)
    await prisma.weightModel.create({
      data: {
        name: '初筛-默认模型',
        category: 'initial',
        weights: JSON.stringify(INITIAL_WEIGHTS),
        positionId: pos.id,
      },
    })
  }

  // 重量级模型只给主推职位配，贴近真实使用情况
  await prisma.weightModel.create({
    data: {
      name: '冰山-默认模型',
      category: 'iceberg',
      weights: JSON.stringify(ICEBERG_WEIGHTS),
      positionId: positionMap.get('高级前端工程师')!,
    },
  })

  for (let i = 0; i < RESUMES.length; i++) {
    const r = RESUMES[i]
    const receivedAt = new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000 - i * 60 * 60 * 1000)
    const email = await prisma.email.create({
      data: {
        messageId: `demo-message-${i + 1}`,
        uid: `demo-uid-${i + 1}`,
        fromAddress: r.email,
        fromName: r.name,
        subject: r.subject,
        receivedAt,
        emailConfigId: mailbox.id,
      },
    })

    const resume = await prisma.resume.create({
      data: {
        emailId: email.id,
        positionId: positionMap.get(r.position),
        resumeSourceId: source.id,
        emailConfigId: mailbox.id,
        sourceEmailFrom: r.email,
        sourceEmailSubject: r.subject,
        sourceEmailReceivedAt: receivedAt,
        candidateName: r.name,
        candidateEmail: r.email,
        candidatePhone: r.phone,
        fileName: r.fileName,
        fileType: 'pdf',
        filePath: `demo/${r.fileName}`,
        fileSize: 120 * 1024,
        status: r.status,
        initialScore: r.initialScore,
        errorMessage: r.errorMessage,
        extractedText: `${r.name}｜${r.position}\n\n（演示数据，无真实附件。接入自己的邮箱后，这里会显示解析出的简历原文。）`,
        // createdAt 显式落在过去一周，趋势图才有起伏
        createdAt: receivedAt,
        screenedDate: r.evaluation ? receivedAt.toISOString().slice(0, 10) : null,
      },
    })

    if (!r.evaluation) continue

    const evaluation = await prisma.positionEvaluation.create({
      data: {
        resumeId: resume.id,
        positionId: positionMap.get(r.position)!,
        summary: r.evaluation.summary,
        strengths: JSON.stringify(r.evaluation.strengths),
        weaknesses: JSON.stringify(r.evaluation.weaknesses),
        aiTags: JSON.stringify(r.evaluation.tags),
        aiModel: 'demo-model',
        initialScore: r.initialScore,
        compositeScore: r.compositeScore,
        screenedAt: receivedAt,
        processingTime: 2000 + i * 120,
      },
    })

    if (!r.followUp) continue

    await prisma.followUpRecord.create({
      data: {
        evaluationId: evaluation.id,
        resumeId: resume.id,
        status: r.followUp.status,
        contacted: r.followUp.contacted,
        note: r.followUp.note,
        interviewTime: r.followUp.interviewTime,
        rejectReason: r.followUp.rejectReason,
        statusChangedAt: new Date(Date.now() - Math.max(r.daysAgo - 1, 0) * 24 * 60 * 60 * 1000),
      },
    })
  }

  await writeMarker()
  return true
}

/** 首次打开且库为空时自动播种；返回是否本次真的灌了数据 */
export async function ensureDemoSeeded(): Promise<boolean> {
  if (await hasOptedOut()) return false
  if (await markerExists()) return false
  if (await hasResumes()) return false
  return seedDemoData()
}

/**
 * 退出演示模式：清空演示数据，让用户从零开始配置自己的邮箱。
 *
 * 删除顺序按外键依赖从叶子表往主表走；AI 配置（用户自己的 Key）保留不动。
 */
export async function exitDemoMode(): Promise<void> {
  await prisma.$transaction([
    prisma.followUpLog.deleteMany(),
    prisma.followUpRecordTag.deleteMany(),
    prisma.followUpRecord.deleteMany(),
    prisma.evaluationDimension.deleteMany(),
    prisma.positionEvaluation.deleteMany(),
    prisma.weightModel.deleteMany(),
    prisma.resume.deleteMany(),
    prisma.email.deleteMany(),
    prisma.taskBatch.deleteMany(),
    prisma.position.deleteMany(),
    prisma.resumeSource.deleteMany(),
    prisma.emailConfig.deleteMany(),
    prisma.webhookIntegration.deleteMany(),
  ])
  await removeMarker()
  // 记下「已退出」，避免空库又被自动播种回来
  await fs.mkdir(path.dirname(optOutPath()), { recursive: true })
  await fs.writeFile(optOutPath(), new Date().toISOString(), 'utf8')
}

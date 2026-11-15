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
  /** 初筛分（0-100）。知识/技能两维度的星级由它反推，保证分数与星级自洽 */
  initialScore: number | null
  /** 距今天数，用于把数据摊在近一周，让趋势图有起伏 */
  daysAgo: number
  subject: string
  errorMessage?: string
  /** 有值则生成评估记录、六维度评分与跟进记录 */
  evaluation?: {
    summary: string
    strengths: string[]
    weaknesses: string[]
    tags: string[]
    /** 简历里出现过的项目名，用于生成「评分依据」中的证据引述 */
    projects: string[]
    /** 冰山水下四维度手评：[自我认知, 品质特质, 价值观, 动机]，1-5 星 */
    hidden: [number, number, number, number]
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
    position: '高级前端工程师', status: 'SCREENED', initialScore: 90, daysAgo: 0,
    subject: '应聘：高级前端工程师',
    evaluation: {
      summary: '6 年前端经验，主导过 3 个百万级 DAU 产品的性能优化，工程化体系搭建完整。',
      strengths: ['性能优化有量化结果，首屏 2.4s → 0.9s', '组件库与脚手架落地到 12 条业务线', '监控体系从 0 到 1'],
      weaknesses: ['缺少跨端（小程序 / RN）项目经验', '团队管理经验偏少'],
      tags: ['React', '性能优化', '工程化'],
      projects: ['商城首页性能专项', '组件库 2.0', '前端监控平台'],
      hidden: [4, 4, 5, 5],
    },
    followUp: { status: 'INTERVIEW_SCHEDULED', contacted: 'CONTACTED', interviewTime: '2026-11-18 14:00', note: '一面已约，重点问性能优化方案' },
  },
  {
    name: '李娜', email: 'lina@example.com', phone: '13800000002', fileName: '李娜-全栈开发.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 80, daysAgo: 0,
    subject: '社招投递 - 全栈工程师',
    evaluation: {
      summary: '4 年全栈经验，前后端都能独立交付，SQL 与接口设计扎实。',
      strengths: ['独立交付 6 个业务模块', '有 Postgres 慢查询治理经验'],
      weaknesses: ['前端动效与设计还原度一般'],
      tags: ['Node.js', 'TypeScript', 'Postgres'],
      projects: ['供应商协同后台', '库存对账服务', '订单中心拆分'],
      hidden: [4, 4, 4, 3],
    },
    followUp: { status: 'CONTACTING', contacted: 'CONTACTED', note: '已发面试邀约，等回复' },
  },
  {
    name: '王强', email: 'wangqiang@example.com', phone: '13800000003', fileName: '王强-产品设计.pdf',
    position: '产品设计师', status: 'SCREENED', initialScore: 90, daysAgo: 1,
    subject: '应聘产品设计师 - 简历',
    evaluation: {
      summary: '5 年 B 端设计经验，主导过设计系统建设，业务理解能力强。',
      strengths: ['设计系统从 0 到 1，覆盖 40+ 组件', '能独立做用户访谈与需求拆解'],
      weaknesses: ['C 端增长类项目经验较少'],
      tags: ['Figma', '设计系统', 'B 端'],
      projects: ['B 端设计系统 2.0', '数据看板改版', '客户管理后台'],
      hidden: [4, 4, 5, 4],
    },
    followUp: { status: 'INTERVIEWED', contacted: 'CONTACTED', note: '二面已过，等作品集补充' },
  },
  {
    name: '刘洋', email: 'liuyang@example.com', phone: '13800000004', fileName: '刘洋-前端工程师.pdf',
    position: '高级前端工程师', status: 'SCREENED', initialScore: 60, daysAgo: 2,
    subject: 'Re: 前端工程师职位申请',
    evaluation: {
      summary: '3 年前端经验，业务开发熟练，但缺少复杂场景与性能优化沉淀。',
      strengths: ['业务迭代速度快，能快速上手新框架'],
      weaknesses: ['无性能优化量化案例', '技术深度不足'],
      tags: ['Vue', '业务开发'],
      projects: ['营销活动页搭建平台', '会员中心改版'],
      hidden: [3, 3, 3, 2],
    },
    followUp: { status: 'UNSUITABLE', contacted: 'CONTACTED', rejectReason: '技术深度与岗位要求不匹配' },
  },
  {
    name: '陈静', email: 'chenjing@example.com', phone: '13800000005', fileName: '陈静-后端开发.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 80, daysAgo: 3,
    subject: '求职：全栈开发工程师',
    evaluation: {
      summary: '5 年后端为主的全栈，服务拆分与稳定性建设经验突出。',
      strengths: ['主导过一次单体到微服务的拆分', '线上事故复盘机制建设'],
      weaknesses: ['前端工程化经验偏弱'],
      tags: ['Java', '微服务', '稳定性'],
      projects: ['订单服务单体拆分', '支付稳定性专项', '接口网关重构'],
      hidden: [4, 4, 4, 3],
    },
    followUp: { status: 'OFFER_SENT', contacted: 'CONTACTED', note: '已发 offer，薪资待确认' },
  },
  {
    name: '赵磊', email: 'zhaolei@example.com', phone: '13800000006', fileName: '赵磊-全栈.pdf',
    position: '全栈工程师', status: 'PENDING', initialScore: null, daysAgo: 3,
    subject: '投递简历 - 全栈',
  },
  {
    name: '孙婷', email: 'sunting@example.com', phone: '13800000007', fileName: '孙婷-UI设计师.pdf',
    position: '产品设计师', status: 'SCREENING', initialScore: null, daysAgo: 3,
    subject: '应聘产品设计师',
  },
  {
    name: '周浩', email: 'zhouhao@example.com', phone: '13800000008', fileName: '周浩-前端.pdf',
    position: '高级前端工程师', status: 'ERROR', initialScore: null, daysAgo: 4,
    subject: '应聘前端工程师', errorMessage: 'PDF 解析失败：文件已加密，无法提取文本',
  },
  {
    name: '吴敏', email: 'wumin@example.com', phone: '13800000009', fileName: '吴敏-前端开发.pdf',
    position: '高级前端工程师', status: 'UNPARSED', initialScore: null, daysAgo: 4,
    subject: '求职申请 - 前端开发',
  },
  {
    name: '郑伟', email: 'zhengwei@example.com', phone: '13800000010', fileName: '郑伟-全栈工程师.pdf',
    position: '全栈工程师', status: 'SCREENED', initialScore: 70, daysAgo: 5,
    subject: '全栈工程师申请',
    evaluation: {
      summary: '4 年经验，业务覆盖广，深度项目经验一般。',
      strengths: ['多技术栈都能上手', '沟通与协作评价好'],
      weaknesses: ['缺少长期维护的大型项目'],
      tags: ['Node.js', 'React'],
      projects: ['门店管理系统', '小程序商城'],
      hidden: [3, 4, 3, 3],
    },
    followUp: { status: 'CONTACTING', contacted: 'CONTACT_FAILED', note: '电话未接通，明天再试' },
  },
  {
    name: '冯雪', email: 'fengxue@example.com', phone: '13800000011', fileName: '冯雪-产品设计.pdf',
    position: '产品设计师', status: 'PENDING', initialScore: null, daysAgo: 5,
    subject: '产品设计师应聘 - 作品集附后',
  },
  {
    name: '许凯', email: 'xukai@example.com', phone: '13800000012', fileName: '许凯-前端.pdf',
    position: '高级前端工程师', status: 'SCREENED', initialScore: 70, daysAgo: 6,
    subject: '应聘：前端开发',
    evaluation: {
      summary: '3 年前端，偏业务交付，工程化参与度低。',
      strengths: ['交付稳定，代码规范'],
      weaknesses: ['无复杂项目主导经验'],
      tags: ['React', '业务开发'],
      projects: ['运营后台表单引擎', '活动页组件化'],
      hidden: [3, 3, 3, 3],
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

/** 冰山水下四维度（演示数据里作为 HR 手评写入） */
const HIDDEN_DIMENSIONS = ['selfAwareness', 'personality', 'values', 'motivation'] as const

// -------------------------------------------------------
// AI 评分依据（EvaluationDimension.aiDetail）生成
//
// 真实流程里 aiDetail 由 AI 逐题作答产出，演示数据没必要接模型，
// 这里用「方向 + 题目模板 + 确定性伪随机」搭一份结构一致的数据：
// 星级 → 各方向通过率 → 逐题是否通过 → 方向星级 → 维度星级，
// 保证「星级、通过题数、总评」三者自洽，不会出现 5 星却全否的情况。
// -------------------------------------------------------

interface DirectionTemplate {
  name: string
  questions: string[]
  /** 通过时的证据模板，{p} 替换为简历里的项目名，{t} 替换为标签 */
  yes: string[]
  /** 未通过时的说明，与 questions 一一对应（第 i 条对应第 i 题） */
  no: string[]
}

const DETAIL_TEMPLATES: Record<'knowledge' | 'skill', DirectionTemplate[]> = {
  knowledge: [
    {
      name: '行业认知',
      questions: [
        '简历是否提到目标行业名称，并能看出业务理解？',
        '是否有目标行业内的实践经历，且能看出时长或深度？',
        '是否有行业相关的证书、培训或社群参与？',
      ],
      yes: [
        '「{p}」直接落在目标行业的业务场景里，能看出对业务链路的理解',
        '明确写出了行业指标口径与上下游协作方，不是泛泛而谈',
        '有目标行业的项目经历（{p}），且能说明在其中的角色',
      ],
      // 未通过说明与上面三题一一对应，避免答「资质证书」却引用了「专业课程」的理由
      no: [
        '只写了公司名称，没有展开行业与业务场景',
        '没有目标行业内的实践经历，经历集中在其他行业',
        '未出现行业相关的证书、培训或社群参与',
      ],
    },
    {
      name: '专业理论',
      questions: [
        '所学专业是否与岗位方向对口？',
        '是否列出与岗位相关的课程、论文或研究方向？',
        '是否持有与岗位相关的专业资格证书？',
      ],
      yes: [
        '专业与岗位方向一致，课程与项目能对应上',
        '列出与岗位相关的课程与毕业设计，理论与岗位要求匹配',
        '持有与岗位相关的专业证书，且层级不低',
      ],
      no: [
        '专业与岗位方向不一致',
        '没有列出与岗位相关的课程、论文或研究方向',
        '未提及与岗位相关的专业资格证书',
      ],
    },
    {
      name: '工具与方法认知',
      questions: [
        '是否列出岗位主流的工具、框架或软件？',
        '是否提到行业通行的流程或规范（评审、走查、发布流程等）？',
        '能否说明工具的适用边界，而不只是罗列名称？',
      ],
      yes: [
        '列出 {t} 等岗位主流工具，并说明在「{p}」中的具体用法',
        '提到评审、走查、灰度发布等通行流程，方法认知完整',
        '能说明工具的适用边界与代价，不只是罗列名称',
      ],
      no: [
        '工具只出现在技能列表里，没有展开使用场景',
        '未提及评审、走查、发布等行业通行流程',
        '只罗列工具名称，看不出适用边界',
      ],
    },
    {
      name: '学习积累',
      questions: [
        '是否有持续学习的记录（课程、证书时间线、技术分享）？',
        '近一年是否有新技术或新方法的学习痕迹？',
        '学到的内容是否有落地到项目中的结果？',
      ],
      yes: [
        '近一年有持续学习记录，并在「{p}」中落地',
        '证书与课程时间线连续，能看出知识面在扩展',
        '自学内容与岗位要求同向，不是零散的收藏',
      ],
      no: [
        '没有课程、证书或技术分享的记录',
        '近一年没有新技术或新方法的学习痕迹',
        '学习内容没有落到项目结果上',
      ],
    },
  ],
  skill: [
    {
      name: '专业实操',
      questions: [
        '是否描述了运用专业能力完成的具体任务（做了什么、怎么做的）？',
        '是否独立负责过完整模块或环节的交付？',
        '是否处理过复杂场景或线上问题？',
      ],
      yes: [
        '在「{p}」中独立完成核心模块，描述里能看出「怎么做」',
        '负责过从方案到上线的完整环节，边界清楚',
        '处理过线上问题，能说明定位与修复过程',
      ],
      no: [
        '描述停留在「参与」「协助」，看不出个人动作',
        '没有独立负责完整模块的记录',
        '未描述复杂场景或线上问题的处理过程',
      ],
    },
    {
      name: '工具运用',
      questions: [
        '是否出现岗位核心工具的具体使用场景？',
        '是否有两个及以上不同场景的深度使用描述？',
        '是否有工具链自动化或提效的实践？',
      ],
      yes: [
        '「{p}」中有两个以上不同场景的工具深度使用描述',
        '有工具链自动化实践，能说明提效幅度',
        '把使用规范沉淀成团队文档，可复用',
      ],
      no: [
        '工具只出现在技能列表，没有使用场景',
        '只有单一场景的简单使用',
        '没有工具链自动化或提效的实践',
      ],
    },
    {
      name: '业务产出',
      questions: [
        '是否有明确的交付物（上线功能、方案、作品集）？',
        '是否有可量化的业务结果（性能、转化、效率数字）？',
        '是否能说清自己在结果中的贡献？',
      ],
      yes: [
        '「{p}」有可量化结果，且能说清自己的贡献占比',
        '交付物明确、可核验，不是过程性描述',
        '产出与业务目标直接挂钩',
      ],
      no: [
        '没有明确的交付物描述',
        '缺少可量化的业务结果',
        '说不清自己在结果中的贡献比例',
      ],
    },
    {
      name: '专业判断',
      questions: [
        '是否描述了需要专业分析或诊断的场景？',
        '是否在多个方案之间做过取舍并说明依据？',
        '是否有复盘、纠偏或经验沉淀的记录？',
      ],
      yes: [
        '在「{p}」中做过方案取舍，并说明判断依据',
        '有复盘记录，能看出纠偏过程',
        '信息不足时给出了阶段性判断，并约定验证方式',
      ],
      no: [
        '没有需要专业分析或诊断的场景描述',
        '未体现多方案取舍与判断依据',
        '没有复盘、纠偏或经验沉淀的记录',
      ],
    },
  ],
}

/** 冰山水下维度按星级给一句 HR 面评，避免手写 28 条注释 */
const HIDDEN_NOTES: Record<(typeof HIDDEN_DIMENSIONS)[number], Record<number, string>> = {
  selfAwareness: {
    5: '能主动说明自己的强项与短板，求职方向与过往经历一致',
    4: '对自身定位清楚，能说出需要补的能力项',
    3: '自我描述偏笼统，优缺点停留在套话层面',
    2: '对自身能力判断与实际经历有偏差',
    1: '对自身定位模糊，说不清适合做什么',
  },
  personality: {
    5: '责任心与抗压性都有具体事例支撑，团队评价正面',
    4: '稳定性与主动性表现正常',
    3: '特质描述缺少具体事例，需面试确认',
    2: '有过短期离职经历，稳定性待确认',
    1: '多次短期离职，稳定性存疑',
  },
  values: {
    5: '在质量与进度的取舍上有明确底线，且有过实际选择',
    4: '对合规与质量的态度端正',
    3: '价值观表述停留在口号层面',
    2: '对合规与质量的态度需要进一步确认',
    1: '对质量与合规缺少基本认知',
  },
  motivation: {
    5: '动机以成长与成就为主，与岗位发展路径匹配',
    4: '动机清晰，稳定性较好',
    3: '动机偏外部因素（薪资、地点），长期意愿待确认',
    2: '动机不明确，求职方向分散',
    1: '动机模糊，看不出对本岗位的兴趣',
  },
}

/** FNV-1a：把种子字符串映射到 [0,1)，用于确定性地挑证据、定通过与否 */
function seededRandom(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

function clampStar(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)))
}

/** 初筛分（0-100）反推知识 / 技能星级：两维各占 50 权重，score = (k + s) × 10 */
function splitInitialScore(score: number): { knowledge: number; skill: number } {
  const total = Math.max(2, Math.min(10, Math.round(score / 10)))
  const knowledge = Math.min(5, Math.ceil(total / 2))
  return { knowledge, skill: Math.max(1, Math.min(5, total - knowledge)) }
}

interface BuiltDetail {
  star: number
  rating: number
  comment: string
  aiDetail: string
}

/**
 * 按目标星级生成一个维度的 aiDetail（新版格式：star / comment / scoringApplied / directions）。
 * 方向级通过率围绕目标星级浮动，最终维度星级取方向星级的平均值再取整，
 * 因此返回的 rating 可能比 target 高或低 1 星——这是刻意的，保证依据和评分自洽。
 */
function buildAiDetail(
  dimension: 'knowledge' | 'skill',
  target: number,
  seed: string,
  projects: string[],
  tags: string[]
): BuiltDetail {
  const templates = DETAIL_TEMPLATES[dimension]
  const baseRatio = Math.max(0.18, Math.min(0.88, (target - 1) / 4))

  const directions = templates.map((tpl, di) => {
    const ratio = Math.max(
      0.1,
      Math.min(0.95, baseRatio + (seededRandom(`${seed}-${dimension}-${di}`) - 0.5) * 0.3)
    )
    const yesCount = Math.round(ratio * tpl.questions.length)

    // 先按哈希排序决定哪几题通过，避免「前 N 题一律通过」的机械感
    const order = tpl.questions
      .map((_, qi) => ({ qi, rank: seededRandom(`${seed}-${dimension}-${di}-${qi}`) }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.qi)
    const passed = new Set(order.slice(0, yesCount))

    // 同方向内按顺序取正面证据，避免两题引用同一句；未通过则用与题目对应的否定说明
    let yesUsed = 0
    const questions = tpl.questions.map((text, qi) => {
      const answer = passed.has(qi)
      const evidence = answer
        ? tpl.yes[yesUsed++ % tpl.yes.length]
            .replace('{p}', projects[(di + qi) % projects.length])
            .replace('{t}', tags[qi % tags.length])
        : tpl.no[qi]
      return {
        key: `${di + 1}.${qi + 1}`,
        text,
        answer,
        evidence,
      }
    })

    const star = clampStar(1 + ratio * 4)
    const comment =
      ratio >= 0.8
        ? '该方向信号充分，可作为加分项'
        : ratio >= 0.5
          ? '该方向有明确信号，深度一般'
          : ratio >= 0.25
            ? '该方向只有零散信号，需要面试确认'
            : '该方向缺少可核验的信号'

    return { name: tpl.name, star, comment, questions, ratio }
  })

  const star = clampStar(directions.reduce((sum, d) => sum + d.star, 0) / directions.length)
  const strong = directions.filter((d) => d.ratio >= 0.5).map((d) => d.name)
  const weak = directions.filter((d) => d.ratio < 0.5).map((d) => d.name)

  const comment = weak.length === 0
    ? `四个方向均有信号，综合 ${star} 星。`
    : strong.length === 0
      ? `四个方向信号都偏弱，综合 ${star} 星。`
      : `${strong.join('、')}信号充分；${weak.join('、')}偏弱，综合 ${star} 星。`

  const scoringApplied =
    `四方向星级 ${directions.map((d) => d.star).join(' / ')}（通过率 ${directions
      .map((d) => `${Math.round(d.ratio * 100)}%`)
      .join(' / ')}），取平均后定为 ${star} 星；` +
    (star >= 4 ? '未触发降级规则。' : '未达到 JD 的经验年限要求，不额外上调。')

  return {
    star,
    rating: star,
    comment,
    aiDetail: JSON.stringify({ star, comment, scoringApplied, directions }),
  }
}

/** 六维加权分（与 evaluation-service.calculateScore 的公式一致：rating × weight / 5） */
function weightedScore(ratings: Record<string, number>, weights: Record<string, number>): number {
  const total = Object.entries(weights).reduce(
    (sum, [dim, weight]) => sum + ((ratings[dim] ?? 0) * weight) / 5,
    0
  )
  return Number(total.toFixed(1))
}

/**
 * 把方向/题目模板渲染成「提示词」编辑区要求的 Markdown：
 * `### 方向名` + 行首 `1.1 题面` + 缩进「评判标准：…」，
 * 与 prompt-assembler.parseDimensionMarkdown 的解析规则保持一致。
 */
function renderDimensionMarkdown(dimension: 'knowledge' | 'skill'): string {
  const lines = [`## ${dimension === 'knowledge' ? '知识维度' : '技能维度'}`, '']
  DETAIL_TEMPLATES[dimension].forEach((tpl, di) => {
    lines.push(`### ${tpl.name}`, '')
    tpl.questions.forEach((question, qi) => {
      const criteria = tpl.yes
        .map((s) => s.replace('{p}', '相关项目').replace('{t}', '相关工具'))
        .join('；')
      lines.push(`${di + 1}.${qi + 1} ${question}`)
      lines.push(`  评判标准：${criteria}`)
      lines.push('')
    })
  })
  return lines.join('\n')
}

/** 演示提示词主体：保留 {{resumeText}} 等占位符，让「提示词」页面的预览与拼装都能正常走通 */
const DEMO_BODY_TEXT = `你是一名资深招聘专家，请依据职位要求评估候选人简历。

职位：{{positionTitle}}
岗位职责：{{positionDescription}}
任职要求：{{requirements}}

知识维度权重 {{knowledgeWeight}}，技能维度权重 {{skillWeight}}。

以下是候选人简历原文：
{{resumeText}}

请按知识、技能两个维度分别给出 1-5 星评分，逐方向说明判断依据，
并输出 JSON：{ summary, strengths[], weaknesses[], extracted_tags[],
knowledge: { star, comment, scoringApplied, directions[] },
skill: { star, comment, scoringApplied, directions[] } }。`

const DEMO_OVERALL_RULES = `1. 只看简历中出现的文字信号，不臆测未写明的经历。
2. 方向星级取该方向通过的题目比例，维度星级取四个方向的平均值。
3. 信息缺失时按「无信号」处理，不因单一方向缺失直接压到最低星。
4. 知识与技能要区分：教育、课程、证书偏知识；实践经历中的行为与成果偏技能。`

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
    // 冰山模型三个职位都配：演示要看到六维雷达与综合分，缺一个职位就会显示空态
    await prisma.weightModel.create({
      data: {
        name: '冰山-默认模型',
        category: 'iceberg',
        weights: JSON.stringify(ICEBERG_WEIGHTS),
        positionId: pos.id,
      },
    })
    // 提示词记录：没有它「提示词」页是空态，详情页的评分依据也取不到题面
    await prisma.promptRecord.create({
      data: {
        positionId: pos.id,
        version: 1,
        bodyText: DEMO_BODY_TEXT,
        knowledgeContent: renderDimensionMarkdown('knowledge'),
        skillContent: renderDimensionMarkdown('skill'),
        overallRules: DEMO_OVERALL_RULES,
        isCurrent: true,
        changeNote: '演示数据初始版本',
        savedBy: 'demo',
      },
    })
  }

  for (let i = 0; i < RESUMES.length; i++) {
    const r = RESUMES[i]
    const receivedAt = new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000 - i * 60 * 60 * 1000)

    // 已评估的简历：先按目标初筛分生成知识/技能评分依据，再由星级回算分数。
    // 这样「6 个维度星级 → 初筛分 / 综合分」完全对得上，点「重新评分」不会跳数。
    const scored = (() => {
      if (!r.evaluation || r.initialScore == null) return null
      const levels = splitInitialScore(r.initialScore)
      const knowledge = buildAiDetail('knowledge', levels.knowledge, `${r.name}-k`, r.evaluation.projects, r.evaluation.tags)
      const skill = buildAiDetail('skill', levels.skill, `${r.name}-s`, r.evaluation.projects, r.evaluation.tags)
      const hidden = r.evaluation.hidden
      const ratings: Record<string, number> = {
        knowledge: knowledge.rating,
        skill: skill.rating,
        selfAwareness: hidden[0],
        personality: hidden[1],
        values: hidden[2],
        motivation: hidden[3],
      }
      return {
        knowledge,
        skill,
        ratings,
        initialScore: (ratings.knowledge + ratings.skill) * 10,
        compositeScore: weightedScore(ratings, ICEBERG_WEIGHTS),
      }
    })()

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
        initialScore: scored?.initialScore ?? r.initialScore,
        compositeScore: scored?.compositeScore ?? null,
        errorMessage: r.errorMessage,
        extractedText: `${r.name}｜${r.position}\n\n（演示数据，无真实附件。接入自己的邮箱后，这里会显示解析出的简历原文。）`,
        // createdAt 显式落在过去一周，趋势图才有起伏
        createdAt: receivedAt,
        screenedDate: r.evaluation ? receivedAt.toISOString().slice(0, 10) : null,
      },
    })

    if (!r.evaluation || !scored) continue

    const positionId = positionMap.get(r.position)!

    // 六维评分：知识/技能来自 AI（带评分依据），冰山水下四维为 HR 手评
    await prisma.evaluationDimension.createMany({
      data: [
        {
          resumeId: resume.id,
          positionId,
          dimension: 'knowledge',
          rating: scored.knowledge.rating,
          comment: scored.knowledge.comment,
          aiDetail: scored.knowledge.aiDetail,
          source: 'ai',
        },
        {
          resumeId: resume.id,
          positionId,
          dimension: 'skill',
          rating: scored.skill.rating,
          comment: scored.skill.comment,
          aiDetail: scored.skill.aiDetail,
          source: 'ai',
        },
        ...HIDDEN_DIMENSIONS.map((dim, index) => {
          const rating = r.evaluation!.hidden[index]
          return {
            resumeId: resume.id,
            positionId,
            dimension: dim,
            rating,
            comment: HIDDEN_NOTES[dim][rating] ?? null,
            source: 'manual',
          }
        }),
      ],
    })

    const evaluation = await prisma.positionEvaluation.create({
      data: {
        resumeId: resume.id,
        positionId,
        summary: r.evaluation.summary,
        strengths: JSON.stringify(r.evaluation.strengths),
        weaknesses: JSON.stringify(r.evaluation.weaknesses),
        aiTags: JSON.stringify(r.evaluation.tags),
        aiModel: 'demo-model',
        initialScore: scored.initialScore,
        compositeScore: scored.compositeScore,
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

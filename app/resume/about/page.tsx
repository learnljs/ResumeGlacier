import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BookOpen,
  Mail,
  FileText,
  Layers,
  Target,
  GitBranch,
  Workflow,
  Webhook,
  ShieldCheck,
  KeyRound,
  SunMoon,
  ArrowRight,
  Database,
  Github,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: '系统介绍 · 简历智能筛选',
  description:
    'ResumeGlacier 自托管 AI 简历筛选系统：IMAP 自动收取、两级文本提取、冰山模型六维评估、跟进状态机与 Webhook 通用导出，数据留在你自己的服务器上。',
}

const features: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}[] = [
  {
    icon: Mail,
    title: 'IMAP 自动收取',
    desc: '兼容任意 IMAP 邮箱（QQ、企业邮、Gmail、Outlook 等），增量 UID 追踪 + messageId 去重，每 30 分钟自动收取，也可手动触发。',
  },
  {
    icon: FileText,
    title: '两级文本提取',
    desc: 'PDF 视觉排序提取失败或质量不达标时，自动降级到 Tesseract.js OCR（中英文），仍失败才标记错误，保证识别率。',
  },
  {
    icon: Layers,
    title: '冰山模型 6 维评估',
    desc: '知识 / 技能 / 自我认知 / 品质 / 价值观 / 动机，每个职位独立配置权重，AI 自动评分 + 人工覆盖双轨。',
  },
  {
    icon: Target,
    title: '按职位独立评估',
    desc: '同一份简历可对多个职位分别评估，结果互不覆盖，详情页下拉切换，候选人池支持跨职位挑人。',
  },
  {
    icon: GitBranch,
    title: '提示词版本管理',
    desc: '每个职位 4 个编辑区，每次保存自动生成版本，支持历史查看、diff 对比与一键回滚，对未来评估立即生效。',
  },
  {
    icon: Workflow,
    title: '跟进状态机',
    desc: '10 种状态的完整流转，正向流转校验必填字段，支持逐级回退并写入审计日志。',
  },
  {
    icon: Webhook,
    title: 'Webhook 通用导出',
    desc: '进入「待面试」及之后阶段自动触发推送，5 种字段转换，不绑定任何下游——企微、飞书、Slack、自建表都能对接。',
  },
  {
    icon: ShieldCheck,
    title: '登录与人员管理',
    desc: '全站登录默认开启，仅预登记手机号且启用的人员可登录；密码 scrypt 哈希，会话为签名 HttpOnly Cookie。',
  },
  {
    icon: KeyRound,
    title: '数据 AES 加密',
    desc: '邮箱密码、AI Key、Webhook URL 全部 AES-256-GCM 加密存储，密钥来自 ENCRYPTION_KEY，数据库可再放加密磁盘。',
  },
  {
    icon: SunMoon,
    title: '深浅色 + 首屏直出',
    desc: '左下角外观开关记忆选择并跟随系统；数据概览首屏数字服务端直出，切换筛选时才重新取数，无闪烁。',
  },
]

const flow = [
  'IMAP 收取',
  '两级文本提取',
  '质量门禁',
  'AI 六维评估',
  '跟进状态机',
  'Webhook 推送',
]

const tech = [
  'Next.js 16',
  'React',
  'TypeScript',
  'Prisma + SQLite',
  'Tailwind CSS',
  'node-cron',
  'pdfjs-dist',
  'Tesseract.js',
  'OpenAI SDK',
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-border shadow-soft">
        <div
          className="px-6 py-10 lg:px-10 lg:py-14"
          style={{ backgroundImage: 'var(--gradient-primary)' }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            <BookOpen className="h-3.5 w-3.5" />
            自托管 · 开源 MIT · 数据自主
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
            ResumeGlacier 简历智能筛选系统
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 lg:text-base">
            把「收邮件 → 解析 → AI 评估 → 跟进 → 导出」整套招聘初筛流程，落到你自己的服务器上。
            所有数据留在本地，开源、可审计、可定制。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/resume/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-white/90"
            >
              打开工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/learnljs/ResumeGlacier"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              <Github className="h-4 w-4" />
              GitHub 仓库
            </a>
          </div>
        </div>
      </section>

      {/* 痛点 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">它解决什么</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          中小 HR 团队在简历初筛阶段普遍面临的三类痛点。
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: '渠道分散',
              d: '简历来自邮箱、Boss 直聘、内推等多个渠道，需要人工汇总。',
            },
            {
              t: '标准不一',
              d: '不同 HR 主观判断差异大，缺乏可复用的统一评分体系。',
            },
            {
              t: '隐私合规',
              d: '简历数据敏感，不希望流转到第三方 SaaS 平台。',
            },
          ].map((item) => (
            <div
              key={item.t}
              className="rounded-xl border border-border bg-card p-5 text-card-foreground"
            >
              <h3 className="text-sm font-semibold">{item.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 核心能力 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">核心能力</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          从收取到导出的完整链路，能力开箱即用。
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {f.desc}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 数据流向 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">数据流向</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          一份简历从进入系统到推送给下游的全过程。
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-5">
          {flow.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground">
                {step}
              </span>
              {i < flow.length - 1 && (
                <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 登录与权限 */}
      <section className="mt-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base">登录与权限</CardTitle>
                <CardDescription className="mt-0.5">
                  默认开启全站登录拦截，适合团队共用或放到局域网。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              • 未登录访问任意页面会跳到 <code className="rounded bg-muted px-1 py-0.5 text-foreground">/login</code>，直接调 API 返回 401。
            </p>
            <p>
              • 仅管理员在「系统配置 → 人员管理」预先登记手机号且状态启用的人员可登录，不开放自助注册。
            </p>
            <p>
              • 密码用 scrypt + 独立随机盐哈希存储；会话是 HMAC-SHA256 签名的 HttpOnly Cookie，改密或停用后其他设备会话立即失效。
            </p>
            <p>
              • 首次部署走 <code className="rounded bg-muted px-1 py-0.5 text-foreground">/setup</code>，用 <code className="rounded bg-muted px-1 py-0.5 text-foreground">SETUP_CODE</code> 创建第一位管理员；想本机免登录，在 <code className="rounded bg-muted px-1 py-0.5 text-foreground">.env</code> 设 <code className="rounded bg-muted px-1 py-0.5 text-foreground">AUTH_ENABLED=false</code> 即可。
            </p>
          </CardContent>
        </Card>
      </section>

      {/* 技术栈 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">技术栈</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          单机本地运行：一台电脑装好 Node.js 22+ 即可，无需 Docker 或容器编排。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {tech.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
            >
              <Database className="h-3.5 w-3.5 text-accent" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* 快速开始 */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">快速开始</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: '1', t: '安装依赖', d: 'npm install' },
            { n: '2', t: '配置环境变量', d: 'cp .env.example .env，填 ENCRYPTION_KEY / SETUP_CODE' },
            { n: '3', t: '初始化数据库', d: 'npm run db:setup（Prisma generate + db push）' },
            { n: '4', t: '启动', d: 'npm run dev → localhost:3000 → 首次 /setup' },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-border bg-card p-4 text-card-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {s.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {s.d}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          空数据库首次打开会自动写入一份演示数据（虚构简历与职位），免配置即可看到看板、列表与跟进看板的真实样子；页面顶部提示条可一键退出演示模式。
        </p>
      </section>

      {/* 页脚 */}
      <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        ResumeGlacier 采用 MIT 许可证 · 让 AI 助力招聘，从简历海洋中精准发现人才。
      </footer>
    </div>
  )
}

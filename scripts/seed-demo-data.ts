/**
 * 演示数据脚本：在空数据库里插入少量简历，让 UI 卡片流有数据可看
 * 用法：npx tsx scripts/seed-demo-data.ts
 * 可逆：脚本会创建/复用「Demo 演示」标识的数据，可手动从管理后台删除
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const POSITIONS = [
  { title: '高级前端工程师', department: '研发', description: '负责 Web 端核心功能开发', requirements: 'React/Next.js 5 年以上' },
  { title: '全栈工程师', department: '研发', description: '负责产品全链路开发', requirements: 'Node.js + 前端 3 年以上' },
  { title: '产品设计师', department: '设计', description: '负责产品 UX/UI 设计', requirements: 'Figma、原型设计' },
]

interface DemoResume {
  name: string
  email: string
  phone: string
  fileName: string
  status: 'UNPARSED' | 'PENDING' | 'SCREENING' | 'SCREENED' | 'ERROR'
  initialScore: number | null
  positionTitle: string
  sourceSubject: string
  daysAgo: number
  errorMessage?: string
}

const RESUMES: DemoResume[] = [
  { name: '张伟', email: 'zhangwei@foxmail.com', phone: '13800138001', fileName: '张伟-高级前端工程师.pdf', status: 'SCREENED', initialScore: 87, positionTitle: '高级前端工程师', sourceSubject: '应聘：高级前端工程师', daysAgo: 1 },
  { name: '李娜', email: 'lina@gmail.com', phone: '13900139002', fileName: '李娜-全栈开发.pdf', status: 'SCREENED', initialScore: 72, positionTitle: '全栈工程师', sourceSubject: '社招投递 - 全栈工程师', daysAgo: 2 },
  { name: '王强', email: 'wqiang@163.com', phone: '13700137003', fileName: '王强-产品设计.pdf', status: 'SCREENED', initialScore: 91, positionTitle: '产品设计师', sourceSubject: '应聘产品设计师 - 简历', daysAgo: 3 },
  { name: '刘洋', email: 'liuyang@outlook.com', phone: '13600136004', fileName: '刘洋-前端工程师.pdf', status: 'SCREENED', initialScore: 56, positionTitle: '高级前端工程师', sourceSubject: 'Re: 前端工程师职位申请', daysAgo: 4 },
  { name: '陈静', email: 'chenjing@126.com', phone: '13500135005', fileName: '陈静-前端开发.pdf', status: 'PENDING', initialScore: null, positionTitle: '高级前端工程师', sourceSubject: '求职：前端开发工程师', daysAgo: 1 },
  { name: '赵磊', email: 'zhaolei@foxmail.com', phone: '13400134006', fileName: '赵磊-Fullstack.pdf', status: 'PENDING', initialScore: null, positionTitle: '全栈工程师', sourceSubject: '投递简历 - 全栈', daysAgo: 2 },
  { name: '孙婷', email: 'sunting@gmail.com', phone: '13300133007', fileName: '孙婷-UI 设计师.pdf', status: 'PENDING', initialScore: null, positionTitle: '产品设计师', sourceSubject: '应聘产品设计师', daysAgo: 0 },
  { name: '周浩', email: 'zhouhao@163.com', phone: '13200132008', fileName: '周浩-前端工程师.pdf', status: 'ERROR', initialScore: null, positionTitle: '高级前端工程师', sourceSubject: '应聘前端工程师', daysAgo: 5, errorMessage: 'PDF 解析失败：文件已加密' },
  { name: '吴敏', email: 'wumin@126.com', phone: '13100131009', fileName: '吴敏-前端.pdf', status: 'SCREENING', initialScore: null, positionTitle: '高级前端工程师', sourceSubject: '求职申请 - 前端', daysAgo: 0 },
  { name: '郑伟', email: 'zhengwei@outlook.com', phone: '13000130010', fileName: '郑伟-全栈.pdf', status: 'SCREENED', initialScore: 64, positionTitle: '全栈工程师', sourceSubject: '全栈工程师申请', daysAgo: 6 },
]

async function main() {
  console.log('开始插入演示数据...')

  // 1) ResumeSource
  const source = await prisma.resumeSource.upsert({
    where: { name: '演示数据源' },
    update: {},
    create: { name: '演示数据源', description: '演示用简历来源' },
  })
  console.log(`✓ ResumeSource: ${source.name}`)

  // 2) EmailConfig
  const emailConfig = await prisma.emailConfig.upsert({
    where: { id: 'demo-email-config' },
    update: {},
    create: {
      id: 'demo-email-config',
      alias: 'demo@hr.example.com',
      host: 'imap.example.com',
      port: 993,
      user: 'demo@hr.example.com',
      password: '',
      resumeSourceId: source.id,
    },
  })
  console.log(`✓ EmailConfig: ${emailConfig.alias}`)

  // 3) Positions（title 非 unique，用 findFirst + create）
  const positionMap = new Map<string, string>()
  for (const p of POSITIONS) {
    const existing = await prisma.position.findFirst({ where: { title: p.title } })
    const pos = existing ?? (await prisma.position.create({ data: p }))
    positionMap.set(p.title, pos.id)
  }
  console.log(`✓ Positions: ${positionMap.size} 个`)

  // 4) Emails + Resumes（每条 resume 关联一封 email）
  let count = 0
  for (let i = 0; i < RESUMES.length; i++) {
    const r = RESUMES[i]
    const messageId = `demo-${i + 1}-${Date.now()}`
    const email = await prisma.email.create({
      data: {
        messageId,
        uid: `demo-uid-${i + 1}`,
        fromAddress: r.email,
        fromName: r.name,
        subject: r.sourceSubject,
        receivedAt: new Date(Date.now() - r.daysAgo * 24 * 60 * 60 * 1000),
        emailConfigId: emailConfig.id,
      },
    })

    await prisma.resume.create({
      data: {
        emailId: email.id,
        positionId: positionMap.get(r.positionTitle),
        resumeSourceId: source.id,
        emailConfigId: emailConfig.id,
        sourceEmailFrom: r.email,
        sourceEmailSubject: r.sourceSubject,
        sourceEmailReceivedAt: email.receivedAt,
        candidateName: r.name,
        candidateEmail: r.email,
        candidatePhone: r.phone,
        fileName: r.fileName,
        fileType: 'pdf',
        filePath: `demo/${r.fileName}`,
        fileSize: 100 * 1024,
        status: r.status,
        initialScore: r.initialScore,
        errorMessage: r.errorMessage,
        extractedText: '演示简历文本内容...',
      },
    })
    count++
  }
  console.log(`✓ Resumes + Emails: ${count} 条`)

  console.log('\n✅ 演示数据插入完成！刷新 http://localhost:3000/resume/list 查看')
}

main()
  .catch((e) => {
    console.error('失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * 演示数据 CLI
 *
 * 用法：npm run db:demo
 *
 * 逻辑与「首次启动自动播种」共用 lib/services/demo-mode.ts，
 * 这里只做命令行包装，避免两处数据定义漂移。
 */
import { seedDemoData, getDemoStatus } from '../lib/services/demo-mode'
import { prisma } from '../lib/prisma'

async function main() {
  const created = await seedDemoData()
  const status = await getDemoStatus()

  if (created) {
    console.log('✅ 演示数据已写入')
  } else {
    console.log('⏭  库里已有简历，跳过播种（如需重来请先删库或点页面上的「删除演示数据」）')
  }
  console.log(`   简历 ${status.counts.resumes} 份 · 职位 ${status.counts.positions} 个 · 跟进 ${status.counts.followUps} 条`)
  console.log('   打开 http://localhost:3000/resume/dashboard 查看')
}

main()
  .catch((e) => {
    console.error('失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * 种子脚本：预置常用跟进标签（按分类）
 *
 * 创建 3 大类标签：
 * - hard: 硬性标签（985、211、海归、应届、往届等）
 * - intent: 意向判断（高意向、薪资不匹配等）
 *
 * 已有标签存在则跳过，幂等。
 *
 * 使用方式：npx tsx scripts/seed-followup-tags.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PRESET_TAGS: Array<{ name: string; color: string; source: string; category: string }> = [
  // === 硬性标签（AI 自动） ===
  { name: '985', color: '#3b82f6', source: 'ai', category: 'hard' },
  { name: '211', color: '#6366f1', source: 'ai', category: 'hard' },
  { name: '海归', color: '#8b5cf6', source: 'ai', category: 'hard' },
  { name: '应届', color: '#06b6d4', source: 'ai', category: 'hard' },
  { name: '往届', color: '#0ea5e9', source: 'ai', category: 'hard' },
  { name: '1-3年经验', color: '#14b8a6', source: 'ai', category: 'hard' },
  { name: '3-5年经验', color: '#10b981', source: 'ai', category: 'hard' },
  { name: '5-10年经验', color: '#22c55e', source: 'ai', category: 'hard' },
  { name: '10年+经验', color: '#84cc16', source: 'ai', category: 'hard' },
  { name: '大厂背景', color: '#eab308', source: 'ai', category: 'hard' },
  { name: '管理经验', color: '#f59e0b', source: 'ai', category: 'hard' },

  // === 意向判断（HR 手动） ===
  { name: '高意向', color: '#22c55e', source: 'manual', category: 'intent' },
  { name: '观望中', color: '#f59e0b', source: 'manual', category: 'intent' },
  { name: '薪资不匹配', color: '#f97316', source: 'manual', category: 'intent' },
  { name: '可聊', color: '#3b82f6', source: 'manual', category: 'intent' },
  { name: '已聊', color: '#6366f1', source: 'manual', category: 'intent' },
]

async function main() {
  console.log('开始预置常用跟进标签...\n')

  let created = 0
  let skipped = 0
  const existing = new Map<string, string>()

  // 先加载已有标签
  const allTags = await prisma.followUpTag.findMany()
  for (const tag of allTags) {
    existing.set(tag.name, tag.id)
  }

  for (const tagDef of PRESET_TAGS) {
    if (existing.has(tagDef.name)) {
      // 更新已有标签的 source 和 category（如果是默认值则覆盖）
      const existingTag = allTags.find(t => t.name === tagDef.name)!
      if (existingTag.source === 'manual' && existingTag.category === 'custom') {
        await prisma.followUpTag.update({
          where: { id: existingTag.id },
          data: { source: tagDef.source, category: tagDef.category, color: tagDef.color },
        })
        console.log(`  🔄 ${tagDef.name} → source=${tagDef.source}, category=${tagDef.category}`)
      } else {
        console.log(`  ⏭ ${tagDef.name} 已存在 (source=${existingTag.source}, category=${existingTag.category})，跳过`)
      }
      skipped++
    } else {
      await prisma.followUpTag.create({
        data: {
          name: tagDef.name,
          color: tagDef.color,
          source: tagDef.source,
          category: tagDef.category,
        },
      })
      console.log(`  ✅ ${tagDef.name} (${tagDef.category}) 创建成功`)
      created++
    }
  }

  console.log(`\n预置完成: 新建 ${created} 个，跳过 ${skipped} 个`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

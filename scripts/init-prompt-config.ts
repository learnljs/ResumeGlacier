/**
 * 评估提示词初始化迁移脚本（开发方案 10.1）
 *
 * 部署前手动执行一次：
 *   npx tsx scripts/init-prompt-config.ts
 *
 * 逻辑：
 * 1. 使用从硬编码迁移后的 bodyText / knowledgeContent / skillContent / overallRules（开发方案 2.1 + 10.1 verbatim 内容）
 * 2. 遍历所有 Position，为每个尚未配置的职位 INSERT 一行 PromptRecord（version=1, isCurrent=true）
 * 3. 幂等：已存在 PromptRecord 的职位跳过
 *
 * 说明：knowledgeContent / skillContent 各自独立存储 Markdown 原文（不含 `## 维度` 边界头，
 *       该头由 prompt-assembler 拼接时补齐）。内容包含 4 方向 × 全部问题（知识 15 题、技能 16 题）。
 */

import { prisma } from '@/lib/prisma'
import {
  parseDimensionMarkdown,
  validateDimensionStructure,
  REQUIRED_PLACEHOLDER,
} from '@/lib/services/prompt-assembler'

// === 编辑区 A：提示词主体（开发方案 2.1 bodyText 初始内容） ===
const BODY_TEXT = `你是一位经验丰富的HR招聘专家和简历筛选助手。你的任务是根据给定的职位要求和评分标准，对候选人简历进行客观、系统化的评估。

## 核心任务

1. 从 JD 中提取关键信息（行业、年限、工具、学历、证书等）
2. 对每个问题逐一判断"是/否"，答"是"时必须引用简历原文作为 evidence
3. 识别简历中的项目类型及数量
4. 输出结构化 JSON

## 招聘职位

**职位名称**：{{positionTitle}}

**职位描述**：
{{positionDescription}}

**筛选要求**：
{{requirements}}

## JD 解读说明

- 若 JD 写"专业不限"或未提及专业要求，专业相关性题目直接答"是"
- 若 JD 有经验年限要求，年限题以 JD 要求为准；JD 未提则默认 3 年
- JD 提到某方面：评分时重点检查简历是否符合该 JD 要求
- JD 没提到某方面：正常判断，基于简历内容回答，不视为"否"
- JD 中"XX经验者优先"不视为加分项，有则正常算分，无则正常不算分

## 候选人简历内容
{{resumeText}}`

// === 编辑区 B：知识维度（4 方向 15 题，开发方案 2.1 + 原 knowledge-skill-criteria 迁移） ===
const KNOWLEDGE_CONTENT = `### 评分规则
1. 对每个方向下的所有问题逐一判断"是"或"否"，答"是"时引用简历原文作为证据，答"否"时证据为 null
2. 方向内星级计算：统计该方向下答"是"的问题数量，代入公式 round(答"是"数量 / 该方向总题数 × 4) + 1，结果范围 1-5 星。举例：4 题中答"是"2 题 -> round(2/4×4)+1 = 3 星
3. 如果某方向所有问题均答"否"，该方向评为 1 星
4. 维度最终星级计算：列出该维度下每个方向各自的星级，统计每个星级值出现了多少次，出现次数最多的那个星级作为该维度的基础星级。举例：4 个方向分别为 3星、3星、4星、2星 -> 3星出现 2 次最多 -> 基础星级为 3
5. 如果多个星级出现次数并列最多（平局），取其中较低的那个。举例：2星出现 2 次，3星也出现 2 次 -> 取较低的 2 星
6. 升至 5 星附加条件：必须超过 75% 的方向达到 5 星，否则即使 5 星出现次数最多也降为 4 星。举例：4 个方向中只有 1 个方向 5 星（25%，不足 75%）-> 降为 4 星
7. 降至 1 星附加条件：必须所有方向星级都 ≤ 2 星，否则升为 2 星
8. 判定原则：技能清单中出现的"了解/熟悉/熟练/精通/掌握"等自评词一律不作为评分依据，只有具体实践场景中出现了该工具才有效

### 行业认知
1.1 候选人在目标行业的累计年限是否 ≥ 3 年（JD 要求更高时按 JD）？
  评判标准：比较简历中累计工作年限与标准（JD 有要求按 JD，无要求默认 3 年）
1.2 是否有 ≥ 2 段经历在目标行业内？
  评判标准：统计简历中属于目标行业的独立工作或实习经历的段数
1.3 简历中是否使用 ≥ 3 个行业术语或业务概念？
  评判标准：统计简历中出现的行业专属术语和业务概念的数量
1.4 是否有行业相关证书或培训？
  评判标准：检查简历中是否列出了行业认可的证书或参与过的行业培训

### 专业理论
2.1 学历专业是否与岗位相关（JD 写"专业不限"或未提及专业要求时直接答"是"）？
  评判标准：比对简历中的学历专业与岗位要求
2.2 学校是否为重点院校（985/211/双一流/海外院校）？
  评判标准：查看学校层次，JD 无要求时仍按实际院校层次正常评估
2.3 是否有岗位相关证书？
  评判标准：检查是否列出了与岗位要求直接相关的证书
2.4 是否有学术成果（论文、专利、研究项目）？
  评判标准：检查简历中是否列出了已发表的论文、已授权的专利或已完成的研究项目

### 工具方法认知
3.1 是否列出 ≥ 5 个相关工具/技术？
  评判标准：数技能清单中相关工具数量（忽略自评词，只看工具名）
3.2 是否至少 2 个工具有展开描述（不是仅列名）？
  评判标准：至少 2 个工具有具体使用场景或参数描述
3.3 简历中工具是否在实践段有使用场景？
  评判标准：工具是否出现在实践描述中（仅列名不算）

### 学习积累
4.1 是否有培训/课程记录？
  评判标准：是否列出培训/课程/讲座
4.2 是否有自学内容？
  评判标准：是否列出自学记录（书籍/课程/博客）
4.3 是否有 ≥ 2 个不同时间点的证书？
  评判标准：多个证书的考取时间不同
4.4 是否有最近 1 年的学习记录？
  评判标准：最近 1 年内有学习活动`

// === 编辑区 C：技能维度（4 方向 16 题，开发方案 2.1 + 原 knowledge-skill-criteria 迁移） ===
const SKILL_CONTENT = `### 评分规则
1. 方向内星级计算公式与知识维度相同：round(答"是"数量 / 该方向总题数 × 4) + 1
2. 维度最终星级计算方式与知识维度相同（统计各方向星级，出现次数最多的为基础星级，平局取低，5 星附加条件相同，1 星附加条件相同）
3. 技能维度 3 星以上附加检查：至少需要 1 段实践描述使用了"独立完成"、"主导"、"从0到1"、"攻坚"、"设计"等强动词。如果全部使用"参与"、"协助"、"支持"等弱动词，技能星级上限降为 2 星
4. 技能维度 4 星以上附加检查：至少需要 1 段企业级或长期实习（≥ 6 个月）项目经验，否则星级上限降为 3 星
5. 技能维度 5 星附加检查：至少需要 2 段企业级项目，或者 1 段企业级项目 + 1 段国家级/国际级竞赛项目，否则星级上限降为 4 星
6. 项目类型效力排序（从高到低）：企业级项目 > 长期实习（≥ 6 个月）> 国家级/国际级竞赛 > 省级竞赛 > 课程/毕设项目 > 个人/兴趣项目
7. 判定原则：无具体数字的模糊表述（如"提升效率"、"优化体验"）不算有效产出；"参与"、"协助"、"支持"等弱动词不算强动词；实习生和应届生无正式工作经历时，课程项目、竞赛作品、个人项目中的实操描述可作为有效实践经历参与评分

### 专业实操
1.1 是否有具体任务规模描述（包含数字：如用户数、数据量、模块数）？
  评判标准：数字 + 规模对象，如"服务 100 万用户"、"处理 500GB 数据"
1.2 是否使用了强动词（独立完成、主导、从0到1、攻坚、设计）？
  评判标准：至少 1 段经历描述使用了上述强动词
1.3 是否有 ≥ 1 段企业级或长期（≥ 6 个月）实习项目经历？
  评判标准：至少 1 段符合企业级或长期实习标准的项目
1.4 是否处理过复杂或疑难任务（不是纯日常操作）？
  评判标准：任务描述中包含"复杂"、"疑难"、"攻坚"、"突发"等特征词

### 工具运用
2.1 是否在实践段有工具的具体使用场景？
  评判标准：工具 + 使用动作（仅自评"熟练/精通"不算）
2.2 同一工具是否在 ≥ 2 个不同场景中使用？
  评判标准：同一工具出现 ≥ 2 段不同场景
2.3 是否有工具的深入使用描述（如调优/优化/参数配置/性能提升）？
  评判标准：描述中体现"调优/优化/参数/性能/复杂配置"等关键词
2.4 是否有工具组合使用（多工具协同）？
  评判标准：多工具在同一项目中协同

### 业务产出
3.1 是否有具体量化数字（百分比、绝对值、规模）？
  评判标准：至少 1 段实践经历中出现了具体的数字指标
3.2 是否有对比基线（从 X 提升到 Y）？
  评判标准：至少 1 段有改善前后的对比数据
3.3 是否有多段（≥ 2 段）实践经历都描述了具体产出？
  评判标准：至少 2 段不同实践经历有独立的产出描述
3.4 产出是否有可验证的影响范围？
  评判标准：产出指标的覆盖范围可验证，如用户量、部门、收入等

### 专业判断
4.1 是否有独立分析场景（不依赖他人）？
  评判标准：描述中有"独立/自主/自行"分析
4.2 是否有诊断根因/解决疑难问题的描述？
  评判标准：涉及问题诊断/根因分析
4.3 是否有决策影响范围的描述（团队/部门级）？
  评判标准：描述中有"带领团队/团队决策/团队级影响"等字样
4.4 是否有判断依据的说明（不是无依据断言）？
  评判标准：描述有"因为/基于/通过"等依据`

// === 编辑区 D：通用评分规则（开发方案 10.1，不含维度头，由 assembler 补齐） ===
const OVERALL_RULES = `1. 知识维度权重 {{knowledgeWeight}}%，技能维度权重 {{skillWeight}}%
2. 两个维度的评分规则已分别在各维度的"### 评分规则"中定义，AI 需严格逐维度执行各自的规则对每个方向进行评分，不需要计算综合星级`

/**
 * 初始化前自检：校验四块内容的结构合法性
 * 抛错则中止，避免写入无效配置
 */
function selfCheck(): void {
  if (!BODY_TEXT.includes(REQUIRED_PLACEHOLDER)) {
    throw new Error(`bodyText 必须包含 ${REQUIRED_PLACEHOLDER} 占位符`)
  }
  if (!OVERALL_RULES.trim()) {
    throw new Error('overallRules 不能为空')
  }

  const kData = parseDimensionMarkdown(KNOWLEDGE_CONTENT)
  const sData = parseDimensionMarkdown(SKILL_CONTENT)
  const kErrors = validateDimensionStructure(kData)
  const sErrors = validateDimensionStructure(sData)
  if (kErrors.length > 0) {
    throw new Error(`knowledgeContent 结构非法：\n  - ${kErrors.join('\n  - ')}`)
  }
  if (sErrors.length > 0) {
    throw new Error(`skillContent 结构非法：\n  - ${sErrors.join('\n  - ')}`)
  }

  const kCount = kData.directions.reduce((s, d) => s + d.questions.length, 0)
  const sCount = sData.directions.reduce((s, d) => s + d.questions.length, 0)
  console.log(`[自检] 知识维度：${kData.directions.length} 方向 / ${kCount} 题`)
  console.log(`[自检] 技能维度：${sData.directions.length} 方向 / ${sCount} 题`)
}

async function main(): Promise<void> {
  console.log('=== 评估提示词初始化迁移开始 ===\n')
  selfCheck()

  const positions = await prisma.position.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\n共 ${positions.length} 个职位待检查\n`)

  let created = 0
  let updated = 0
  let skipped = 0
  for (const p of positions) {
    const existing = await prisma.promptRecord.findFirst({
      where: { positionId: p.id },
      select: { id: true, bodyText: true },
    })

    if (!existing) {
      // 新职位：写入完整初始提示词
      await prisma.promptRecord.create({
        data: {
          positionId: p.id,
          version: 1,
          bodyText: BODY_TEXT,
          knowledgeContent: KNOWLEDGE_CONTENT,
          skillContent: SKILL_CONTENT,
          overallRules: OVERALL_RULES,
          isCurrent: true,
          changeNote: '从代码迁移初始版本',
        },
      })
      console.log(`  ✓ 已为「${p.title}」写入 v1 初始提示词`)
      created++
      continue
    }

    if (existing.bodyText === BODY_TEXT) {
      console.log(`  跳过「${p.title}」（bodyText 已是最新结构）`)
      skipped++
      continue
    }

    // 已存在但 bodyText 为旧结构：仅更新 bodyText，保留 knowledge/skill/overallRules 原值
    await prisma.promptRecord.update({
      where: { id: existing.id },
      data: {
        bodyText: BODY_TEXT,
        changeNote: '重组结构：简历文本移至末尾以启用 DeepSeek 缓存',
      },
    })
    console.log(`  ↻ 已更新「${p.title}」的 bodyText 结构`)
    updated++
  }

  console.log(`\n=== 完成：新建 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条 ===`)
}

main()
  .catch((err) => {
    console.error('\n[初始化失败]', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

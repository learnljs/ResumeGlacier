/**
 * 验证评分细化功能
 *
 * 用法：node scripts/verify-scoring.mjs <resumeId> [positionId]
 *
 * 1. 对指定简历执行完整 AI 筛选
 * 2. 检查 EvaluationDimension 中的 aiDetail 是否为新格式
 * 3. 打印评分计算详情
 */

const BASE_URL = 'http://localhost:3001'

async function main() {
  const resumeId = process.argv[2]
  const positionId = process.argv[3]

  if (!resumeId) {
    console.error('用法: node scripts/verify-scoring.mjs <resumeId> [positionId]')
    process.exit(1)
  }

  console.log(`验证简历 ${resumeId}${positionId ? ` 岗位 ${positionId}` : ''}`)

  // Step 1: 获取简历基本信息
  const resumeResp = await fetch(`${BASE_URL}/api/resumes/${resumeId}`)
  const resumeData = await resumeResp.json()
  console.log(`简历状态: ${resumeData.status}`)
  console.log(`简历文本长度: ${resumeData.extractedText?.length || 0} 字符`)

  // Step 2: 触发 AI 筛选（如果尚未评估）
  if (resumeData.status !== 'SCREENED') {
    console.log('\n触发 AI 筛选...')
    const screenResp = await fetch(`${BASE_URL}/api/resumes/${resumeId}/screen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId: positionId || resumeData.positionId }),
    })
    const screenResult = await screenResp.json()
    console.log(`筛选结果:`, JSON.stringify(screenResult, null, 2).slice(0, 500))
  }

  // Step 3: 检查 EvaluationDimension
  const evalResp = await fetch(
    `${BASE_URL}/api/evaluations?resumeId=${resumeId}${positionId ? `&positionId=${positionId}` : ''}`
  )
  const evalData = await evalResp.json()

  console.log('\n=== 评分详情 ===')
  for (const dim of evalData.dimensions || evalData) {
    console.log(`\n维度: ${dim.dimension}`)
    console.log(`星级: ${dim.rating}`)
    console.log(`来源: ${dim.source}`)
    console.log(`摘要: ${dim.comment}`)

    if (dim.aiDetail) {
      const detail = typeof dim.aiDetail === 'string' ? JSON.parse(dim.aiDetail) : dim.aiDetail

      // 检查新旧格式
      if (detail.questions) {
        console.log('格式: 新版（31题）')
        // 统计"是"的数量
        const yesCount = Object.values(detail.questions).filter(
          (q) => q.answer === true
        ).length
        const totalCount = Object.keys(detail.questions).length
        console.log(`答题: ${yesCount}/${totalCount} 个"是"`)

        if (detail.directions) {
          for (const [dirKey, dirData] of Object.entries(detail.directions)) {
            console.log(
              `  ${dirKey}: ${dirData.yesCount}/${dirData.totalCount} → ${dirData.star}星`
            )
          }
        }

        if (detail.voting) {
          console.log(`多数决: ${detail.voting.majorityStar}星`)
          if (detail.voting.adjustments?.length > 0) {
            console.log(`调整: ${detail.voting.adjustments.join('；')}`)
          }
        }

        if (detail.insurance) {
          console.log(`保险规则触发: ${detail.insurance.applied?.join(', ') || '无'}`)
          if (detail.insurance.overrides?.length > 0) {
            console.log(`覆盖: ${detail.insurance.overrides.join('；')}`)
          }
        }
      } else {
        console.log('格式: 旧版（aspects + reasoning）')
      }
    } else {
      console.log('aiDetail: 无（旧版评分或无AI评分）')
    }
  }
}

main().catch(console.error)

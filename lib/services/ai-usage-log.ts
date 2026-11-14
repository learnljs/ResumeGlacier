// lib/services/ai-usage-log.ts
// AI usage 明细日志工具：console + 文件双写（单行 JSON，防并发交错）
// 供 screening / extraction 两个 AI 调用点记录 token 构成与耗时
import * as fs from 'fs'
import * as path from 'path'

export interface AiUsageEntry {
  ts: string
  resumeId: string
  stage: 'extraction' | 'screening'
  model: string
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  apiMs: number
  finishReason?: string
  contentLen?: number
}

export function logAiUsage(entry: AiUsageEntry): void {
  const line = JSON.stringify(entry)
  console.log(`[ai-usage] ${line}`)
  try {
    const dir = path.join(process.cwd(), 'data', 'logs')
    const file = path.join(dir, `ai-usage-${entry.ts.slice(0, 10)}.log`)
    fs.appendFileSync(file, line + '\n')
  } catch (err) {
    console.error('[ai-usage] 日志写入失败:', err instanceof Error ? err.message : err)
  }
}

/**
 * 简历统计范围（邮箱 / 来源维度）
 *
 * 看板的统计数据需要支持按「邮箱」和「来源」两个维度收敛：
 * - 单邮箱单来源时不提供切换，直接全量统计；
 * - 多邮箱 / 多来源时才允许选择，并把条件透传到统计接口。
 *
 * 这里只负责「URL 参数 → Prisma where 条件」的转换，统计逻辑各自保留在调用方。
 */

export interface ResumeScope {
  /** 邮箱配置 id；空表示不限 */
  emailConfigId?: string
  /** 简历来源 id；空表示不限 */
  resumeSourceId?: string
}

/** 从查询参数解析统计范围，忽略空串 */
export function parseScope(params: URLSearchParams): ResumeScope {
  const emailConfigId = params.get('emailConfigId')?.trim() || undefined
  const resumeSourceId = params.get('resumeSourceId')?.trim() || undefined
  return { emailConfigId, resumeSourceId }
}

/**
 * 把统计范围转成可放进 Prisma `AND` 的条件数组。
 * 无筛选时返回空数组，便于调用方自由拼装。
 */
export function scopeConditions(scope?: ResumeScope): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = []
  if (scope?.emailConfigId) conditions.push({ emailConfigId: scope.emailConfigId })
  if (scope?.resumeSourceId) conditions.push({ resumeSourceId: scope.resumeSourceId })
  return conditions
}

/**
 * 组合统计范围与额外条件；全部为空时返回空对象（等价于不过滤）。
 */
export function scopedWhere(
  scope?: ResumeScope,
  ...extra: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const conditions = scopeConditions(scope)
  for (const item of extra) {
    if (item && Object.keys(item).length > 0) conditions.push(item)
  }
  return conditions.length > 0 ? { AND: conditions } : {}
}

/** 是否需要展示维度切换：任一维度存在多个可选值 */
export function needsScopePicker(scope: {
  emailConfigs: Array<{ id: string }>
  sources: Array<{ id: string }>
}): boolean {
  return scope.emailConfigs.length > 1 || scope.sources.length > 1
}

/**
 * 通过简历关联收敛的门条件，供 FollowUpRecord / PositionEvaluation 这类
 * 「自身不存邮箱与来源、只能经由 resume 归属」的模型使用。
 * 无筛选时返回 undefined，调用方按需 push。
 */
export function scopeRelationWhere(scope?: ResumeScope) {
  const emailConfigId = scope?.emailConfigId
  const resumeSourceId = scope?.resumeSourceId
  if (!emailConfigId && !resumeSourceId) return undefined
  return {
    resume: {
      ...(emailConfigId ? { emailConfigId } : {}),
      ...(resumeSourceId ? { resumeSourceId } : {}),
    },
  }
}

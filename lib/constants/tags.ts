/**
 * 跟进标签分组常量
 *
 * FollowUpTag.category 的枚举值与中文映射，用于弹窗和系统配置页的分组展示。
 */

// ---- 分组标签 ----

export const CATEGORY_LABELS: Record<string, string> = {
  hard: '硬性标签',
  intent: '意向判断',
  custom: '自定义',
}

// ---- 分组排序 ----

export const CATEGORY_ORDER = [
  'custom',
  'hard',
  'intent',
] as const

// ---- 分组背景色（用于系统配置页卡片） ----

export const CATEGORY_COLORS: Record<string, string> = {
  hard: 'border-blue-200 bg-blue-50',
  intent: 'border-amber-200 bg-amber-50',
  custom: 'border-gray-200 bg-gray-50',
}

// ---- 分组标识色点（用于弹窗标题） ----

export const CATEGORY_DOT_COLORS: Record<string, string> = {
  hard: '#3b82f6',
  intent: '#f59e0b',
  custom: '#6b7280',
}

// ---- 新建标签可选色板（单一来源，按色相排序） ----

/**
 * 新建标签时的候选颜色。此前 FollowUpDialog / BatchFollowUpDialog（10 色）
 * 与 TagEditPopover（12 色）各自维护一份且互不一致，现统一为本表。
 */
export const TAG_COLORS: string[] = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4',
  '#10b981', '#22c55e', '#84cc16', '#eab308',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899',
]

/** 标签分组（用于弹窗内按分组渲染标签列表） */
export interface TagGroup<T> {
  category: string
  label: string
  color: string
  tags: T[]
}

/**
 * 按 CATEGORY_ORDER 把标签分组，组内按名称排序，空组剔除。
 * category 缺省视为 'custom'（避免无分类标签在列表中不可见）。
 */
export function groupTagsByCategory<T extends { name: string; category?: string }>(
  tags: T[]
): TagGroup<T>[] {
  return CATEGORY_ORDER.map((cat) => ({
    category: cat as string,
    label: CATEGORY_LABELS[cat] || (cat as string),
    color: CATEGORY_DOT_COLORS[cat] || '#6b7280',
    tags: tags
      .filter((t) => (t.category || 'custom') === cat)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh')),
  })).filter((g) => g.tags.length > 0)
}

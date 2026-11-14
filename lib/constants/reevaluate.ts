/**
 * 复评页面本地持久化键与筛选初始态（代码质量专项：自 reevaluate/page.tsx 抽出）。
 *
 * 这些值会在刷新 / 跨页面返回时复用，属于配置而非页面状态，单独成模块后
 * 便于后续把复评页的状态编排继续拆成 hook。
 */

import type { ReevaluateFilterValues } from '@/types/reevaluate'

/** 筛选条件键名 */
export const FILTERS_KEY = 'reevaluate-filters-v3'
/** 滚动位置键名 */
export const SCROLL_KEY = 'reevaluate-scroll-v2'
/** 评估批次键名（跨页面导航恢复轮询） */
export const BATCH_KEY = 'reevaluate-batch-v2'
/** 岗位列表缓存键名（避免返回页面时等待 API） */
export const POSITIONS_KEY = 'reevaluate-positions-v1'

/** 筛选值初始态 */
export const EMPTY_FILTERS: ReevaluateFilterValues = {
  minEducation: '',
  schoolTier: '',
  majors: '',
  minWorkYears: '',
  minGraduationYears: '',
  maxGraduationYears: '',
  englishLevel: '',
}

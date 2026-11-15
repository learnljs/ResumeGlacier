import { PageSkeleton } from '@/components/ui/page-skeleton'

/**
 * 路由级加载兜底：从左侧菜单切页时，浏览器立刻先拿到这层骨架，
 * 而不是干等新页面的空壳和接口数据。各页面内部的骨架负责同形占位。
 */
export default function ResumeLoading() {
  return <PageSkeleton variant="table" rows={6} />
}

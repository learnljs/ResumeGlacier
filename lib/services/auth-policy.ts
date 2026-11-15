/**
 * 访问策略的纯判定层，供 proxy.ts 调用，也便于单测覆盖。
 * 不依赖 Next / Prisma / 环境变量，保持无副作用。
 */

/** 登录与初始化页必须放行，否则冷启动会死锁 */
export const PUBLIC_PAGES = ['/login', '/setup'] as const

/**
 * 放行理由：
 * - /api/auth/*：鉴权模块自身接口，其中人员管理等写操作在路由内二次校验登录态
 * - /api/cron/*：调度器内部调用，原本就有 CRON_SECRET 保护
 * - /api/health：容器 / 监控探活
 */
export const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/cron/', '/api/health'] as const

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true
  }
  return PUBLIC_API_PREFIXES.some(
    (p) => pathname === p || pathname === p.replace(/\/$/, '') || pathname.startsWith(p)
  )
}

export type AccessDecision = 'allow' | 'redirect-login' | 'unauthorized'

export function decideAccess(pathname: string, hasValidSession: boolean): AccessDecision {
  if (isPublicPath(pathname)) return 'allow'
  if (hasValidSession) return 'allow'
  return pathname.startsWith('/api/') ? 'unauthorized' : 'redirect-login'
}

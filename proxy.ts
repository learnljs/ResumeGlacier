import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, verifySession } from '@/lib/services/auth-token'
import { decideAccess } from '@/lib/services/auth-policy'

/**
 * 全站访问拦截（Next.js 16 的 proxy 约定，默认 Node.js 运行时）。
 *
 * 只做「签名 cookie 是否有效」这一层无状态校验，不查数据库，避免把
 * Prisma 打进网络边界包。人员是否被停用，由 auth-store.getSessionUser()
 * 在需要授权的 API 里回查数据库确认；放行清单见 auth-policy.ts。
 */
export function proxy(request: NextRequest) {
  // 本地演示 / 截图 / 自动化测试可整体关闭；默认开启
  if (process.env.AUTH_ENABLED === 'false') return NextResponse.next()

  const { pathname } = request.nextUrl
  const valid = Boolean(verifySession(request.cookies.get(AUTH_COOKIE)?.value))
  const decision = decideAccess(pathname, valid)

  if (decision === 'allow') return NextResponse.next()
  if (decision === 'unauthorized') {
    return NextResponse.json(
      { error: '登录状态已失效，请重新登录' },
      { status: 401 }
    )
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  if (pathname !== '/') url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // 静态资源不进拦截层；其余路径（含页面与 API）全部经过
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|woff2?|ttf|txt|xml)$).*)',
  ],
}

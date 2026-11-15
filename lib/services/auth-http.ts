import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE, SESSION_TTL_SECONDS, buildSessionPayload, signSession } from '@/lib/services/auth-token'
import type { HrUser } from '@prisma/client'

/** 安全解析 JSON 对象，非法请求体返回 null 而不是抛 500 */
export async function readJsonBody(
  request: NextRequest
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

export function apiFail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

function cookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // 局域网内通常是 http；只有确实是 https 时才加 Secure，否则浏览器不会回传 cookie
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
  }
}

export function attachSession(
  response: NextResponse,
  user: HrUser,
  request: NextRequest
): NextResponse {
  response.cookies.set(AUTH_COOKIE, signSession(buildSessionPayload(user)), {
    ...cookieOptions(request),
    maxAge: SESSION_TTL_SECONDS,
  })
  return response
}

export function clearSession(response: NextResponse, request: NextRequest): NextResponse {
  response.cookies.set(AUTH_COOKIE, '', {
    ...cookieOptions(request),
    maxAge: 0,
  })
  return response
}

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/services/auth-http'

export async function POST(request: NextRequest) {
  return clearSession(NextResponse.json({ ok: true }), request)
}

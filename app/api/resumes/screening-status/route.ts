import { NextResponse } from 'next/server'
import { screeningQueue } from '@/lib/services/screening-queue'

export async function GET() {
  const status = screeningQueue.getStatus()
  return NextResponse.json(status)
}

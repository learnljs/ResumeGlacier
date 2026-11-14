import { NextResponse } from 'next/server'
import { resumeParsingQueue } from '@/lib/services/resume-parsing-queue'

export async function GET() {
  const status = resumeParsingQueue.getStatus()
  return NextResponse.json(status)
}

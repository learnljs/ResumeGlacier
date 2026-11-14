'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Zap, FileText } from 'lucide-react'
import { StructuredDataView } from '@/components/resume/StructuredDataView'

/**
 * 详情页「结构化数据」Tab（B9 从 page.tsx 提取）。
 * 有数据 → 渲染 StructuredDataView + 重新提取；无数据 → 空态引导提取。
 */
export function ResumeDetailStructuredTab({
  structuredData,
  extracting,
  onExtract,
}: {
  structuredData: string | null
  extracting: boolean
  onExtract: () => void
}) {
  const parsed = (() => {
    if (!structuredData) return null
    try {
      return JSON.parse(structuredData)
    } catch {
      return {}
    }
  })()

  return (
    <div className="space-y-4">
      {parsed ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">已提取结构化数据</p>
            <Button
              onClick={onExtract}
              disabled={extracting}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {extracting ? '提取中...' : '重新提取'}
            </Button>
          </div>
          <StructuredDataView data={parsed} />
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-muted-foreground">
              尚未提取结构化数据
            </p>
            <Button
              onClick={onExtract}
              disabled={extracting}
              className="gap-2"
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {extracting ? '提取中...' : '提取结构化数据'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

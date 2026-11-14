'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * 详情页「异常信息」Tab（B9 从 page.tsx 提取）。
 * 展示后端记录的 errorMessage，并提供「重新获取 / 重新解析」两条修复路径。
 */
export function ResumeDetailErrorTab({
  errorMessage,
  refetching,
  reparsing,
  onRefetch,
  onReparse,
}: {
  errorMessage: string | null
  refetching: boolean
  reparsing: boolean
  onRefetch: () => void
  onReparse: () => void
}) {
  return (
    <div className="space-y-4">
      <Card className="border-destructive/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            异常信息
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {errorMessage ? (
            <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-destructive bg-destructive/10 rounded-lg p-4 overflow-x-auto">
              {errorMessage}
            </pre>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              未记录具体异常信息
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground mb-3">尝试修复此异常：</p>
          <div className="flex gap-3">
            <Button
              onClick={onRefetch}
              disabled={refetching || reparsing}
              variant="outline"
              className="gap-2 text-warning border-warning/40 hover:bg-warning/10 hover:text-warning"
            >
              {refetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {refetching ? '获取中...' : '重新获取'}
            </Button>
            <Button
              onClick={onReparse}
              disabled={reparsing || refetching}
              variant="outline"
              className="gap-2"
            >
              {reparsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {reparsing ? '解析中...' : '重新解析'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            重新获取：从邮箱重新下载邮件附件并解析 | 重新解析：使用本地已有文件重新解析
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

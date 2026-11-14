'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import FilePreview from '@/components/resume/FilePreview'

/**
 * 详情页「简历内容」Tab（B9 从 page.tsx 提取）。
 * 左：原件预览；右：解析出的纯文本，解析失败时提供重新解析入口。
 */
export function ResumeDetailTextTab({
  resumeId,
  fileType,
  fileName,
  extractedText,
  reparsing,
  onReparse,
}: {
  resumeId: string
  fileType: string
  fileName: string
  extractedText: string | null
  reparsing: boolean
  onReparse: () => void
}) {
  const isParseError = !!extractedText?.startsWith('解析错误')

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">文件预览</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            <FilePreview
              resumeId={resumeId}
              fileType={fileType}
              fileName={fileName}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">提取文本</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            {extractedText && !isParseError ? (
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-foreground">
                {extractedText}
              </pre>
            ) : (
              <div className="text-center py-8 space-y-4">
                <AlertTriangle className="h-10 w-10 text-warning mx-auto" />
                <p className="text-muted-foreground">
                  {isParseError ? extractedText : '无法提取简历文本'}
                </p>
                <Button
                  onClick={onReparse}
                  disabled={reparsing}
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

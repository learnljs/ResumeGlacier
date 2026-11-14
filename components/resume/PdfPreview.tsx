'use client'

// Polyfill URL.parse — pdfjs-dist v5.x 内部依赖此 API，部分运行时未实现
const _URL = URL as unknown as { parse?: (url: string | URL, base?: string) => URL | null }
if (!_URL.parse) {
  _URL.parse = (url: string | URL, base?: string): URL | null => {
    try {
      return new URL(url, base)
    } catch {
      return null
    }
  }
}

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertTriangle } from 'lucide-react'

// 使用本地 worker，版本与 react-pdf 内置的 pdfjs-dist 完全匹配
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfPreviewProps {
  url: string
}

export default function PdfPreview({ url }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [error, setError] = useState<string | null>(null)
  const [workerError, setWorkerError] = useState(false)

  const handleLoadError = useCallback((err: Error) => {
    const msg = err.message || '未知错误'
    if (msg.includes('worker') || msg.includes('Worker') || msg.includes('Failed to fetch')) {
      setWorkerError(true)
      setError(`PDF 渲染引擎加载失败，请刷新页面重试`)
    } else {
      // 直接展示 pdf.js 返回的原始错误信息
      setError(`PDF 加载失败: ${msg}`)
    }
  }, [])

  if (error) {
    return (
      <div className="text-center py-8 space-y-3">
        <AlertTriangle className="h-8 w-8 text-warning mx-auto" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex justify-center gap-2">
          <a href={url} download className="inline-block">
            <Button variant="outline" size="sm">
              下载原始文件
            </Button>
          </a>
          {workerError && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null)
                setWorkerError(false)
              }}
            >
              重试
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[80px] text-center">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '...'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={numPages <= 0 || pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={scale >= 2.0}
            onClick={() => setScale((s) => Math.min(2.0, s + 0.2))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="overflow-auto border rounded-lg bg-muted">
        <Document
          file={url}
          onLoadSuccess={({ numPages: pages }) => {
            setNumPages(pages)
            setError(null)
          }}
          onLoadError={handleLoadError}
          loading={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
          error={
            <div className="text-center py-8 space-y-3">
              <AlertTriangle className="h-8 w-8 text-warning mx-auto" />
              <p className="text-sm text-muted-foreground">PDF 文档解析失败</p>
              <a href={url} download className="inline-block">
                <Button variant="outline" size="sm">下载原始文件</Button>
              </a>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            loading={
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
            error={
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">页面渲染失败</p>
              </div>
            }
          />
        </Document>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface DocxPreviewProps {
  url: string
}

export default function DocxPreview({ url }: DocxPreviewProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${url}?format=html`)
      .then((res) => {
        if (!res.ok) throw new Error('加载失败')
        return res.text()
      })
      .then((text) => setHtml(text))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [url])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-muted-foreground">{error}</p>
        <a href={url} download className="text-sm text-primary underline">
          下载原始文件
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-auto bg-white">
        <iframe
          srcDoc={html || ''}
          className="w-full min-h-[500px] border-0"
          sandbox="allow-same-origin"
          title="DOCX 预览"
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        格式可能不完整，建议下载原文件查看
      </p>
    </div>
  )
}

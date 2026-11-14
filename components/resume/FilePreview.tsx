'use client'

import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import DocxPreview from './DocxPreview'

const PdfPreview = dynamic(() => import('./PdfPreview'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

interface FilePreviewProps {
  resumeId: string
  fileType: string
  fileName: string
}

export default function FilePreview({ resumeId, fileType, fileName }: FilePreviewProps) {
  const url = `/api/resumes/${resumeId}/file`

  return (
    <div className="space-y-3">
      {fileType === 'pdf' ? (
        <PdfPreview url={url} />
      ) : fileType === 'docx' ? (
        <DocxPreview url={url} />
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">不支持预览该文件格式</p>
        </div>
      )}
      <div className="flex justify-center">
        <a href={url} download={fileName}>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            下载原始文件
          </Button>
        </a>
      </div>
    </div>
  )
}

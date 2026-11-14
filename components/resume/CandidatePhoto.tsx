'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ImageIcon, RefreshCw } from 'lucide-react'

interface CandidatePhotoProps {
  resumeId: string
  photoUrl?: string | null
  name?: string
  className?: string
}

export function CandidatePhoto({ resumeId, photoUrl, name, className = '' }: CandidatePhotoProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  // 头像改走 API 返回：生产模式 public 静态服务不识别运行时新增文件，需重启才生效；
  // 且 API 图片不能用 next/image（optimizer 会把站内 URL 当 public 文件读），用普通 img
  const photoSrc = `/api/resumes/${resumeId}/photo`

  const handleExtractPhoto = async () => {
    setLoading(true)
    setError(null)
    setImgError(false)
    try {
      const res = await fetch(`/api/resumes/${resumeId}/photo`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || json.message || '提取失败')
        // 刷新页面以更新照片显示
        if (json.photoUrl) {
          window.location.reload()
        }
      } else {
        window.location.reload()
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  if (photoUrl) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`group relative rounded-full overflow-hidden bg-muted ${className}`}>
          {imgError ? (
            <ImageIcon className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/50" />
          ) : (
            <img
              src={photoSrc}
              alt={name || '候选人照片'}
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* hover 时显示重新提取按钮 */}
          <button
            type="button"
            onClick={handleExtractPhoto}
            disabled={loading}
            title="重新提取"
            className="absolute bottom-0 right-0 flex items-center justify-center w-5 h-5 rounded-tl-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-2.5 w-2.5" />
            )}
          </button>
        </div>
        {error && (
          <p className="text-xs text-destructive text-center px-1">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center bg-muted rounded-full ${className}`}>
      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
      {error && (
        <p className="text-xs text-destructive mt-1 text-center px-1">{error}</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExtractPhoto}
        disabled={loading}
        className="mt-1 h-auto p-1 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        提取
      </Button>
    </div>
  )
}

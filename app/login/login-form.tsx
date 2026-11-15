'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/components/auth/AuthCard'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error || '登录失败，请稍后重试')
        return
      }
      const raw = params.get('next')
      const target =
        raw && raw.startsWith('/') && !raw.startsWith('//')
          ? raw
          : '/resume/dashboard'
      router.replace(target)
      router.refresh()
    } catch {
      setError('无法连接服务器，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="登录系统"
      description="请使用已由管理员预登记的手机号和本人密码登录。"
      footer="账号由系统管理员在「系统配置 · 人员管理」中登记，未登记的人员无法登录。"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium">手机号</label>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="username"
            placeholder="请输入预登记的手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">密码</label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          登录
        </Button>
      </form>
    </AuthCard>
  )
}

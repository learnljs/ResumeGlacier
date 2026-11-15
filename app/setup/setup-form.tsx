'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthCard } from '@/components/auth/AuthCard'

export function SetupForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    code: '',
    name: '',
    phone: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('两次输入的密码不一致')
      return
    }
    if (form.password.length < 8) {
      setError('密码长度需为 8-72 位')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          phone: form.phone,
          password: form.password,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error || '初始化失败，请稍后重试')
        return
      }
      router.replace('/resume/system-config/staff')
      router.refresh()
    } catch {
      setError('无法连接服务器，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="首次初始化"
      description="创建第一位管理员。完成后请在「人员管理」中登记其他 HR 的手机号与初始密码。"
      footer="初始化码来自服务端 .env 的 SETUP_CODE，只有部署者能看到；创建成功后本页将永久关闭。"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="code" className="text-sm font-medium">初始化码</label>
          <Input
            id="code"
            placeholder="请填写 .env 中的 SETUP_CODE"
            value={form.code}
            onChange={(e) => update('code', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">姓名</label>
          <Input
            id="name"
            placeholder="管理员姓名"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium">手机号</label>
          <Input
            id="phone"
            inputMode="numeric"
            placeholder="作为登录账号"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">密码</label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="8 位以上"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-sm font-medium">确认密码</label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="再输入一次"
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
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
          创建管理员并进入系统
        </Button>
      </form>
    </AuthCard>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  KeyRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { apiErrorMessage } from '@/lib/utils/api-message'

interface StaffUser {
  id: string
  name: string
  phone: string
  role: string
  enabled: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface StaffResponse {
  users: StaffUser[]
  currentUser: StaffUser
}

const EMPTY_NEW = { name: '', phone: '', password: '', role: 'STAFF' }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试')
  return data as T
}

function formatTime(value: string | null): string {
  if (!value) return '从未登录'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function StaffPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [users, setUsers] = useState<StaffUser[]>([])
  const [current, setCurrent] = useState<StaffUser | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_NEW)
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await request<StaffResponse>('/api/auth/staff')
      setUsers(data.users)
      setCurrent(data.currentUser)
      setDenied(false)
    } catch (err) {
      const message = apiErrorMessage(err)
      setDenied(true)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, successMsg: string) {
    setBusy(true)
    try {
      await action()
      toast.success(successMsg)
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function handleCreate() {
    if (!newForm.name.trim() || !newForm.phone.trim() || newForm.password.length < 8) {
      toast.error('请填写姓名、手机号和至少 8 位密码')
      return
    }
    void run(async () => {
      await request('/api/auth/staff', {
        method: 'POST',
        body: JSON.stringify(newForm),
      })
      setNewForm(EMPTY_NEW)
      setShowCreate(false)
    }, '人员已登记')
  }

  function handleToggle(user: StaffUser) {
    void run(async () => {
      await request(`/api/auth/staff/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !user.enabled }),
      })
    }, user.enabled ? '已停用该人员' : '已启用该人员')
  }

  function handleRole(user: StaffUser) {
    const nextRole = user.role === 'ADMIN' ? 'STAFF' : 'ADMIN'
    void run(async () => {
      await request(`/api/auth/staff/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      })
    }, nextRole === 'ADMIN' ? '已设为管理员' : '已设为普通成员')
  }

  function handleReset(user: StaffUser) {
    if (resetPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    void run(async () => {
      await request(`/api/auth/staff/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPassword }),
      })
      setResetId(null)
      setResetPassword('')
    }, '密码已重置，该人员原有登录会话已失效')
  }

  async function handleDelete(user: StaffUser) {
    const ok = await confirmDialog({
      title: `移除 ${user.name}？`,
      description: `手机号 ${user.phone} 将从名单移除，该人员立即无法登录。此操作不可撤销。`,
    })
    if (!ok) return
    await run(async () => {
      await request(`/api/auth/staff/${user.id}`, { method: 'DELETE' })
    }, '人员已移除')
  }

  function handleChangePassword() {
    if (pwdForm.newPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    void run(async () => {
      await request('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify(pwdForm),
      })
      setPwdForm({ oldPassword: '', newPassword: '' })
    }, '密码已修改，其他设备上的登录会话已失效')
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    router.replace('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载人员名单…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">人员管理</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            只有名单内且状态为启用的人员可以登录。手机号由管理员预先登记，系统不开放自助注册。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {current ? (
            <span className="text-sm text-muted-foreground">
              当前登录：<span className="font-medium text-foreground">{current.name}</span>
              <span className="ml-1">({current.phone})</span>
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Button>
        </div>
      </div>

      {denied ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            仅管理员可以管理登录人员。如需登记或调整名单，请联系系统管理员。
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">人员名单</CardTitle>
                <CardDescription>共 {users.length} 人</CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {showCreate ? '取消' : '登记人员'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {showCreate ? (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      placeholder="姓名"
                      value={newForm.name}
                      onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    />
                    <Input
                      placeholder="手机号（登录账号）"
                      inputMode="numeric"
                      value={newForm.phone}
                      onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    />
                    <Input
                      placeholder="初始密码（至少 8 位）"
                      type="text"
                      value={newForm.password}
                      onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
                    />
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={newForm.role}
                      onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}
                    >
                      <option value="STAFF">普通成员</option>
                      <option value="ADMIN">管理员</option>
                    </select>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      初始密码请线下告知本人，对方登录后可在下方自行修改。
                    </p>
                    <Button size="sm" disabled={busy} onClick={handleCreate}>
                      确认登记
                    </Button>
                  </div>
                </div>
              ) : null}

              {users.map((user) => (
                <div key={user.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        {user.role === 'ADMIN' ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : (
                          <UserRound className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <Badge variant={user.role === 'ADMIN' ? 'info' : 'secondary'}>
                            {user.role === 'ADMIN' ? '管理员' : '普通成员'}
                          </Badge>
                          <Badge variant={user.enabled ? 'success' : 'outline'}>
                            {user.enabled ? '已启用' : '已停用'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {user.phone} · 最近登录 {formatTime(user.lastLoginAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => handleRole(user)}>
                        {user.role === 'ADMIN' ? '设为普通成员' : '设为管理员'}
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => handleToggle(user)}>
                        {user.enabled ? '停用' : '启用'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setResetId(resetId === user.id ? null : user.id)
                          setResetPassword('')
                        }}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        重置密码
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDelete(user)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {resetId === user.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                      <Input
                        className="max-w-xs"
                        placeholder={`为 ${user.name} 设置新密码（至少 8 位）`}
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                      />
                      <Button size="sm" disabled={busy} onClick={() => handleReset(user)}>
                        确认重置
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setResetId(null)}>
                        取消
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">修改我的密码</CardTitle>
              <CardDescription>
                修改后，其他设备上用旧密码登录的会话会立即失效。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="w-full space-y-1.5 sm:w-64">
                <label className="text-sm font-medium" htmlFor="old-pwd">原密码</label>
                <Input
                  id="old-pwd"
                  type="password"
                  autoComplete="current-password"
                  value={pwdForm.oldPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
                />
              </div>
              <div className="w-full space-y-1.5 sm:w-64">
                <label className="text-sm font-medium" htmlFor="new-pwd">新密码</label>
                <Input
                  id="new-pwd"
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                />
              </div>
              <Button disabled={busy} onClick={handleChangePassword}>
                保存新密码
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSessionUser, needsSetup } from '@/lib/services/auth-store'
import { LoginForm } from './login-form'

/** 冷启动时直接引导到初始化页；已登录则无需再看登录页 */
export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup')
  if (await getSessionUser()) redirect('/resume/dashboard')

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

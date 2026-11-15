import { redirect } from 'next/navigation'
import { needsSetup } from '@/lib/services/auth-store'
import { SetupForm } from './setup-form'

/** 只在人员名单为空时开放；创建首个管理员后本页永久失效 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')
  return <SetupForm />
}

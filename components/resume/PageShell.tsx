import { cn } from '@/lib/utils'

interface ResumePageShellProps {
  children: React.ReactNode
  className?: string
}

export function ResumePageShell({ children, className }: ResumePageShellProps) {
  return (
    <div className={cn('p-6 space-y-4', className)}>
      {children}
    </div>
  )
}

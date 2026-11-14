import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '简历智能筛选系统',
  description: '自动从通用 IMAP 邮箱获取简历，通过AI智能筛选候选人，提升招聘效率。',
  keywords: ['简历筛选', 'AI招聘', 'Webhook', '智能HR', '简历分析'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
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

/**
 * 首屏主题前置脚本。
 * 必须在页面绘制前同步执行，否则已选深色的用户每次刷新都会先闪一下浅色。
 * 规则：手动选过 → 用 localStorage；没选过 → 跟随系统外观。
 */
const THEME_INIT_SCRIPT = `(function(){try{var k='resume-glacier-theme';var s=localStorage.getItem(k);var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;if(d){c.add('dark')}else{c.remove('dark')}document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

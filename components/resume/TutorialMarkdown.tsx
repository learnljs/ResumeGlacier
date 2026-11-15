import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { TUTORIAL_BASE_PATH } from '@/lib/services/tutorial-docs'

/**
 * 将文档内的相对 .md 链接解析为教程页面路由
 * @param href 原始链接（如 ./01-quickstart.md、../06-system-config/01-email-config.md）
 * @param docDir 当前文档所在目录路径段（相对 public/README/docs）
 * @returns 教程页面路由；无法解析或越出教程根目录时返回 null（保持原生 <a> 渲染）
 */
function resolveDocHref(href: string, docDir: string[]): string | null {
  // 剥离锚点部分，仅解析文件路径
  const hashIdx = href.indexOf('#')
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  if (!pathPart.endsWith('.md')) {
    return null
  }

  // 按当前文档目录逐段解析 ./、../ 相对路径：
  // .. 优先抵消链接自身的前置段，其次抵消当前目录段；当前目录段耗尽后再遇 .. 即判定越出教程根目录，返回 null 保持原生渲染，避免误路由到错误页面（如指向仓库根 README 的链接）
  let dirBudget = docDir.length
  const segments: string[] = []
  for (const seg of pathPart.split('/')) {
    if (!seg || seg === '.') {
      continue
    }
    if (seg === '..') {
      if (segments.length > 0) {
        segments.pop()
      } else if (dirBudget > 0) {
        dirBudget -= 1
      } else {
        return null
      }
    } else {
      segments.push(seg)
    }
  }

  const resolved = [...docDir.slice(0, dirBudget), ...segments].join('/')
  const withoutExt = resolved.replace(/\.md$/, '')
  if (withoutExt === 'README') {
    // 指向根索引
    return TUTORIAL_BASE_PATH
  }
  if (withoutExt.endsWith('/README')) {
    // 目录 README 对应目录路由
    return `${TUTORIAL_BASE_PATH}/${withoutExt.slice(0, -'/README'.length)}`
  }
  return `${TUTORIAL_BASE_PATH}/${withoutExt}`
}

interface TutorialMarkdownProps {
  content: string
  /** 当前文档所在目录路径段（相对 public/README/docs），用于解析相对链接 */
  docDir: string[]
}

/** 教程文档 Markdown 渲染：GFM 表格支持 + 相对链接重写为页内路由 + 放大排版 */
export function TutorialMarkdown({ content, docDir }: TutorialMarkdownProps) {
  return (
    <div className="prose prose-base sm:prose-lg max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-img:rounded-xl prose-table:text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            // 无链接、纯锚点、绝对链接保持原生渲染
            if (
              !href ||
              href.startsWith('#') ||
              href.startsWith('http://') ||
              href.startsWith('https://') ||
              href.startsWith('mailto:')
            ) {
              return <a href={href}>{children}</a>
            }
            const resolved = resolveDocHref(href, docDir)
            if (!resolved) {
              return <a href={href}>{children}</a>
            }
            return <Link href={resolved}>{children}</Link>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

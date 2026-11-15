import { notFound } from 'next/navigation'
import {
  listTutorialTree,
  readTutorialDoc,
} from '@/lib/services/tutorial-docs'
import { TutorialMarkdown } from '@/components/resume/TutorialMarkdown'
import { TutorialMobileNav, TutorialNav } from '@/components/resume/TutorialNav'

interface TutorialContentProps {
  /** 路由路径段，空数组渲染根 README 总索引 */
  slug?: string[]
}

/** 教程页面主体：左侧目录树 + 右侧 Markdown 正文 */
export async function TutorialContent({ slug = [] }: TutorialContentProps) {
  const doc = await readTutorialDoc(slug)
  if (!doc) {
    notFound()
  }
  const tree = await listTutorialTree()

  return (
    <div>
      {/* 移动端目录入口 */}
      <TutorialMobileNav tree={tree} />

      <div className="flex">
        {/* 桌面端侧边目录 */}
        <aside className="hidden lg:block w-64 shrink-0 border-r bg-card">
          <div className="sticky top-0 max-h-screen overflow-y-auto p-3">
            <div className="px-3 py-2">
              <h2 className="text-sm font-semibold">系统介绍</h2>
            </div>
            <TutorialNav tree={tree} />
          </div>
        </aside>

        {/* 正文 */}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          <div className="max-w-5xl mx-auto">
            <TutorialMarkdown content={doc.content} docDir={doc.dir} />
          </div>
        </main>
      </div>
    </div>
  )
}

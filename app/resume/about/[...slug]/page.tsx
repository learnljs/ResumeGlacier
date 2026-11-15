import { TutorialContent } from '@/components/resume/TutorialContent'

export const metadata = {
  title: '系统介绍',
}

/** 系统介绍文档页（按路径段渲染对应 markdown 文档） */
export default async function AboutDocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <TutorialContent slug={slug} />
}

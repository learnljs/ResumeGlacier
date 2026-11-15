import { promises as fs } from 'fs'
import path from 'path'

/** 教程文档根目录（public 下，可直接静态访问） */
const TUTORIAL_ROOT = path.resolve(process.cwd(), 'public', 'README', 'docs')

/** slug 段允许字符白名单：教程文档命名均为数字前缀、字母、连字符、点与下划线 */
const SLUG_SEGMENT_PATTERN = /^[0-9A-Za-z._\-]+$/

/** 教程根真实路径缓存（惰性解析，避免每次请求重复 realpath） */
let cachedRealRoot: string | null = null

/** 获取教程根目录的真实路径（解析软链后的基准） */
async function resolveRealRoot(): Promise<string> {
  if (!cachedRealRoot) {
    cachedRealRoot = await fs.realpath(TUTORIAL_ROOT)
  }
  return cachedRealRoot
}

/** 教程页面路由前缀 */
export const TUTORIAL_BASE_PATH = '/resume/about'

/** 无 README 的目录的显示标题映射（查找表，避免直接展示目录名） */
const DIR_TITLES: Record<string, string> = {
  '08-appendix': '附录',
}

/** 目录树节点：叶子为文档链接，分组为目录 */
export interface TutorialTreeNode {
  title: string
  href?: string
  children?: TutorialTreeNode[]
}

/**
 * 读取教程文档内容
 * @param slug 路由路径段，空数组读取根 README.md
 * @returns 文档内容与所在目录路径段（用于解析相对链接）；文件不存在或路径非法时返回 null
 */
export async function readTutorialDoc(
  slug: string[]
): Promise<{ content: string; dir: string[] } | null> {
  // 输入层拦截：段必须命中命名白名单，且不允许空段、.、..，非法输入直接拒绝（404）
  for (const seg of slug) {
    if (!seg || seg === '.' || seg === '..' || !SLUG_SEGMENT_PATTERN.test(seg)) {
      return null
    }
  }

  // 拼接候选路径：优先同名 .md 文件，其次目录下的 README.md；dir 为文档所在目录路径段
  const candidates: { filePath: string; dir: string[] }[] = [
    { filePath: path.join(TUTORIAL_ROOT, ...slug) + '.md', dir: slug.slice(0, -1) },
    { filePath: path.join(TUTORIAL_ROOT, ...slug, 'README.md'), dir: slug },
  ]

  for (const { filePath, dir } of candidates) {
    // 路径穿越防护：规范化后必须仍位于教程根目录内
    const normalized = path.normalize(filePath)
    if (!normalized.startsWith(TUTORIAL_ROOT + path.sep)) {
      continue
    }
    try {
      // 软链逃逸防护：解析后的真实路径必须仍位于教程根真实路径内（normalize 为纯字符串处理，不解引用软链）
      const [realRoot, realFile] = await Promise.all([
        resolveRealRoot(),
        fs.realpath(normalized),
      ])
      if (!realFile.startsWith(realRoot + path.sep)) {
        continue
      }
      const content = await fs.readFile(realFile, 'utf-8')
      return { content, dir }
    } catch {
      // 文件不存在或路径非法，尝试下一个候选路径
    }
  }
  return null
}

/** 提取文档第一个一级标题作为目录显示标题 */
async function extractTitle(filePath: string, fallback: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^#\s+(.+)$/)
      if (match) {
        return match[1].trim()
      }
    }
  } catch {
    // 读取失败，回退为文件名
  }
  return fallback
}

/** 递归扫描目录构建教程目录树 */
async function scanDir(dirPath: string, urlPrefix: string): Promise<TutorialTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  // 目录内 README.md 置顶作为分组首页，其余按文件名字典序（数字前缀 01-、02- 天然有序）。
  // 用分桶代替单一比较器，避免不一致的比较函数导致排序结果丢元素
  const readmeEntries = entries.filter((entry) => entry.name === 'README.md')
  const restEntries = entries
    .filter((entry) => entry.name !== 'README.md')
    .sort((a, b) => a.name.localeCompare(b.name))
  const sorted = [...readmeEntries, ...restEntries]

  const nodes: TutorialTreeNode[] = []
  for (const entry of sorted) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const readmePath = path.join(entryPath, 'README.md')
      let title: string
      let href: string | undefined
      try {
        await fs.access(readmePath)
        title = await extractTitle(readmePath, entry.name)
        href = `${urlPrefix}/${entry.name}`
      } catch {
        // 目录内无 README，按查找表回退为语义标题，再回退为目录名
        title = DIR_TITLES[entry.name] ?? entry.name
      }
      const children = await scanDir(entryPath, `${urlPrefix}/${entry.name}`)
      // 分组首页（README）已由分组标题承载链接，从子项中剔除避免重复；
      // 仅在存在分组首页时过滤，避免误删同样无首页链接的子分组
      const filteredChildren = href
        ? children.filter((child) => child.href !== href)
        : children
      nodes.push({ title, href, children: filteredChildren })
    } else if (entry.name.endsWith('.md')) {
      const nameWithoutExt = entry.name.replace(/\.md$/, '')
      // 根 README 即教程总索引首页，不在目录树中重复出现
      if (dirPath === TUTORIAL_ROOT && nameWithoutExt === 'README') {
        continue
      }
      const title = await extractTitle(entryPath, nameWithoutExt)
      const href =
        nameWithoutExt === 'README'
          ? urlPrefix
          : `${urlPrefix}/${nameWithoutExt}`
      nodes.push({ title, href })
    }
  }
  return nodes
}

/** 构建完整教程目录树 */
export async function listTutorialTree(): Promise<TutorialTreeNode[]> {
  return scanDir(TUTORIAL_ROOT, TUTORIAL_BASE_PATH)
}

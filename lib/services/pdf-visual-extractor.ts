/**
 * PDF 视觉排序提取器
 *
 * 解决 pdf-parse 按内容流（content stream）顺序提取导致的区块顺序错乱、
 * banner 标题孤立/丢失问题（见 doc/dev/简历筛选与复用评估/PDF简历文本提取准确性提升-开发方案.md 阶段2/3）。
 *
 * 核心算法（确定性逻辑，不调用 AI）：
 *   1. pdfjs-dist getTextContent() 拿到所有 text item（含 x/y 坐标）
 *   2. 过滤噪音 item（字体子集泄漏串片段、孤立 ~ 后缀）——泄漏串是 PDF 实际绘制的文本，
 *      会被拆分成 20+ 字符的纯 base62 片段，既污染输出也干扰布局分析
 *   3. 按 Y 坐标聚类成"行"：相邻 item 的 Y 坐标差值 ≤ max(height)/2 视为同一行
 *   4. 每行内按 X 坐标升序（左 → 右）
 *   5. 行间按 Y 坐标降序（PDF 坐标系 Y 轴向上增长，视觉上自上而下）
 *   6. 双栏列检测（阶段3）：X 坐标出现足够大的空隙且两侧 item 足够多、
 *      跨边界行占比不高时判定为双栏，按"先左列全部、再右列全部"输出
 *   7. 跨页用 \n\n 拼接（保持页码分隔感）
 *
 * 已知限制：
 *   - 双栏列检测为保守策略：跨边界行占比超过阈值时不判定（宁可漏检测也不误伤单栏简历）；
 *     两栏基线对齐较紧的简历可能漏检测，落回逐行交错输出
 *   - 多行段落相邻行距 ≤ 容差时可能错误合并；旋转文字不处理
 *
 * v2 增加：item 级 metrics 统计（FragmentationStats），用于文字层破碎检测（见 doc/dev/简历筛选与复用评估/PDF文字层破碎检测-开发方案.md）。
 *   调用方传 { includeStats: true } 时返回 { text, stats }；不传则行为与 v1 完全一致。
 *
 * 注意：pdfjs-dist v4 在模块顶层使用 process.getBuiltinModule，
 * 必须在其加载前设置 polyfill。因此采用动态 import（与 ocr-engine.ts 一致），
 * 模块顶层的 polyfill 会先于 pdfjs-dist 的模块评估执行。
 */

// pdfjs-dist v4 依赖 process.getBuiltinModule：polyfill 统一由 pdf-common 在模块顶层设置。
// 本模块采用动态 import 加载 pdfjs（见下），pdf-common 的顶层 polyfill 会先于其模块评估执行。
import '@/lib/services/pdf-common'
import type { FragmentationStats } from '@/types/resume'

export interface VisualExtractOptions {
  maxPages?: number // 默认 50（阶段3：主提取路径，覆盖多页简历；OCR 性能限制不再适用）
  onProgress?: (page: number, total: number) => void
  includeStats?: boolean // true 时返回 { text, stats }，用于文字层破碎检测
}

interface PositionedTextItem {
  str: string
  x: number
  y: number
  h: number
  w: number
}

interface SectionBanner {
  text: string
  y: number
  column: 'left' | 'right'
}

// 列检测：跨边界行占比阈值（实测真双栏 11-14%，单栏缩进误判约 48%；取 20% 保守分界）
const COLUMN_CROSS_RATIO_LIMIT = 0.2

// 区块标题识别：基于字体高度差异识别 banner
const BANNER_HEIGHT_RATIO = 1.3    // banner 高度 ≥ 正文 × 1.3
const BANNER_MAX_CHARS = 12        // banner 文本不超过 12 字符
const MIN_ITEMS_BELOW = 2          // banner 下方至少 2 个 item（避免孤立标题；侧栏短区块如"求职信息"也可能仅 1-2 项）
const SIDEBAR_WIDTH_RATIO = 0.5    // 列宽度 ≤ 另一列 × 0.5 视为 sidebar
const COLUMN_MIN_ITEMS_EACH_SIDE = 5  // 列两侧最小 item 数（原 10，sidebar 放宽到 5）

// 区块标题白名单：banner 文本必须包含其一（防大字号姓名/强调词被误判为标题）。
// 用"包含"而非"精确匹配"以兼容图标前缀（如"📖教育经历"）；文本长度已受 BANNER_MAX_CHARS 限制。
const SECTION_TITLE_KEYWORDS = [
  '基本信息', '个人信息', '个人资料', '联系方式', '求职意向', '求职信息',
  '个人优势', '个人特长', '自我描述',
  '专业摘要', '个人简介', '个人概述', '个人总结', '职业概述', '职业简介', '职业定位',
  '教育经历', '教育背景', '教育情况', '学习经历',
  '工作经历', '工作背景', '职业经历', '从业经历', '工作经验', '工作业绩',
  '项目经历', '项目经验', '实践经历', '实习经历', '实习经验', '社会实践',
  '在校经历', '校园经历', '校园实践', '在校实践',
  '创业经历', '创业经验',
  '自我评价', '个人评价', '自我介绍', '自我简介',
  '技能证书', '专业技能', '技能特长', '证书资质', '专业能力',
  '个人荣誉', '获奖情况', '奖项荣誉',
  '兴趣爱好', '个人爱好', '语言能力', '培训经历', '资格证书',
  // 英文简历常见标题（本项目以中文为主，粗放覆盖）
  'education', 'experience', 'summary', 'skills', 'projects',
  'interests', 'awards', 'certificates', 'contact', 'about',
]

/**
 * 判断是否为噪音文本项：字体子集泄漏串片段。
 * 特征：≥19 字符（实测泄漏串被 pdfjs 拆分后的最短片段约 19 字符）、同时含大写+小写+数字、
 * 无空格/符号（pdfjs 把 50 字符泄漏串拆成片段，如 `d7011976a5b63f351HZ63t2_F1JTw4-5WfmYWOGglvHXMhlm2Q~~` 的碎片）。
 *
 * 三重字符校验保护合法长文本：纯数字（手机号/QQ）、纯英文词（如 EducationalBackground）、
 * <19 字符的混合 token（如 `JHS20240101AbCdEfGh`）均不会被过滤。
 * 已知取舍：极少数 ≥19 字符的"混合大小写+数字"合法长 token（如长订单号/项目代号）作为独立文本项时
 * 会被当作泄漏串过滤。泄漏串在模板简历中 100% 出现且会污染输出，此取舍可接受；如误删真实内容，
 * 可在 parseResume 日志或提取结果对比中发现。
 *
 * 注意：不在此过滤孤立 `~`/`~~`（泄漏串 ~~ 后缀被拆分时的残留）。中文简历里 `~` 是合法区间分隔符
 * （如 "3~5年"），独立 `~` item 若被删除会把 "3~5年" 变成 "35年" 改变语义；纯 `~` 行由 cleanText 的
 * `^~+\s*$` 整行规则处理。
 */
function isNoiseItem(str: string): boolean {
  return /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9_-]{19,}~*$/.test(str)
}

/**
 * 从 item 构建视觉行：Y 聚类（容差 max(h)/2）+ 行内 X 升序
 */
function buildRows(items: PositionedTextItem[]): PositionedTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y) // Y 降序（视觉自上而下）
  const rows: PositionedTextItem[][] = []
  let currentRow: PositionedTextItem[] = [sorted[0]]
  let currentY = sorted[0].y

  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i]
    const tol = Math.max(currentRow[0].h, it.h) / 2
    if (Math.abs(currentY - it.y) <= tol) {
      currentRow.push(it) // 同一行
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x)) // 行内按 X 升序
      currentRow = [it]
      currentY = it.y
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x))
  return rows
}

/**
 * 行转字符串（每行 item 直接拼接，行间换行）
 *
 * 行首的 PUA 项目符号（U+E000–U+F8FF，常见 U+F06C）替换为可见的 `●`，
 * 保留 PDF 作者的视觉结构。cleanText 后续仍会过滤非行首的 PUA 字符，
 * 不影响其它图标的清理逻辑。
 */
function rowsToText(rows: PositionedTextItem[][]): string {
  return rows
    .map((row) => {
      const minX = Math.min(...row.map((it) => it.x))
      return row
        .map((it) => {
          if (/[-]/.test(it.str) && it.x === minX) {
            return '●'
          }
          return it.str
        })
        .join('')
    })
    .join('\n')
}

/**
 * 保守的双栏列边界检测。
 * 触发条件（全部满足）：
 *   1. item 数量 ≥24（内容量足够）
 *   2. item 中心 X 的最大空隙 ≥ max(X 范围 * 0.3, 50pt)
 *   3. 空隙两侧 item 各 ≥10（排除右对齐日期/孤立标签等少量右侧内容）
 *   4. 跨边界行占比 ≤ COLUMN_CROSS_RATIO_LIMIT（排除单栏缩进续行等假双栏）
 * 返回列边界 X 坐标；单栏返回 null。
 */
function findColumnBoundary(rows: PositionedTextItem[][]): number | null {
  const items = rows.flat()
  if (items.length < 24 || rows.length < 12) return null

  const centers = items.map((it) => it.x + it.w / 2).sort((a, b) => a - b)
  const range = centers[centers.length - 1] - centers[0]
  let maxGap = 0
  let splitIdx = -1
  for (let i = 0; i < centers.length - 1; i++) {
    const gap = centers[i + 1] - centers[i]
    if (gap > maxGap) {
      maxGap = gap
      splitIdx = i
    }
  }

  const boundary = (centers[splitIdx] + centers[splitIdx + 1]) / 2

  const isLeft = (it: PositionedTextItem) => it.x + it.w / 2 < boundary
  const leftItems = items.filter(isLeft)
  const rightItems = items.filter((it) => !isLeft(it))

  // 稳健跨度：剔除离群 item（孤立符号如泄漏串残留 ~、装饰文本会把跨度拉大
  // 20pt+ 导致 sidebarLike 判定失败——实测左栏真实跨度 144pt，含 ~ 后 168pt）
  const leftSpan = robustColumnSpan(leftItems)
  const rightSpan = robustColumnSpan(rightItems)
  const minSpan = Math.min(leftSpan, rightSpan)
  const maxSpan = Math.max(leftSpan, rightSpan)
  const sidebarLike = minSpan > 0 && minSpan < 150 && maxSpan / minSpan >= 2
  const minGap = sidebarLike ? Math.max(15, minSpan * 0.25) : Math.max(range * 0.3, 50)
  if (maxGap < minGap) return null

  const left = leftItems.length
  const right = rightItems.length
  if (left < COLUMN_MIN_ITEMS_EACH_SIDE || right < COLUMN_MIN_ITEMS_EACH_SIDE) return null

  // 跨边界行占比检查：同一视觉行同时含左右两侧 item 的比例过高 → 非双栏
  let crossRows = 0
  for (const row of rows) {
    const hasLeft = row.some(isLeft)
    const hasRight = row.some((it) => !isLeft(it))
    if (hasLeft && hasRight) crossRows++
  }
  // sidebar 简历（sidebarLike，一栏明显窄）的 sidebar 与 main Y 对齐是常见设计
  // （如左栏基本信息对应右栏经历行），跨边界占比天然偏高，不应按 20% 严格阈值拒绝。
  // 故 sidebarLike 时放宽到 50%，仅排除极端跨边界（几乎每行都跨，更像单栏缩进续行）。
  const crossLimit = sidebarLike ? 0.5 : COLUMN_CROSS_RATIO_LIMIT
  if (crossRows / rows.length > crossLimit) return null

  return boundary
}

/**
 * 区块标题识别：基于字体高度差异识别侧栏 / 主内容中的区块标题。
 * 算法详见 docs/superpowers/specs/2026-08-06-pdf-section-banner-detection-design.md
 */
function findSectionBanners(
  items: PositionedTextItem[],
  rows: PositionedTextItem[][],
  boundary: number | null
): SectionBanner[] {
  if (items.length === 0) return []

  // 1. 正文基准高度（取中位数，避免被大字拉偏）
  const heights = items.map((it) => it.h).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)]

  // 2. banner 候选：高度 ≥ 正文 × BANNER_HEIGHT_RATIO 且文本 ≤ BANNER_MAX_CHARS
  const isBannerCandidate = (it: PositionedTextItem): boolean =>
    it.h >= medianHeight * BANNER_HEIGHT_RATIO &&
    it.str.trim().length > 0 &&
    it.str.trim().length <= BANNER_MAX_CHARS

  // 3. 在 rows 上扫描，合并同一视觉行（去图标碎片）
  const isLeftCol = (it: PositionedTextItem): boolean =>
    boundary !== null && it.x + it.w / 2 < boundary

  const bannersByKey = new Map<string, SectionBanner>()
  for (const row of rows) {
    const candidates = row.filter(isBannerCandidate)
    if (candidates.length === 0) continue

    const first = candidates[0]
    const column: 'left' | 'right' = isLeftCol(first) ? 'left' : 'right'
    const y = first.y

    // 只合并与 banner 同列的 item：跨边界行（左栏标题 + 右栏正文同一 Y）不把另一列正文拼进来
    const sameColText = row
      .filter((it) => (isLeftCol(it) ? 'left' : 'right') === column)
      .map((it) => it.str)
      .join('')
      .trim()

    // 合并后重新校验长度：大字号姓名与正文同行时（如"邱祥文主修方向：..."）会被拼长，超限丢弃
    if (sameColText.length === 0 || sameColText.length > BANNER_MAX_CHARS) continue

    // 白名单校验：区块标题必须命中关键词（防大字号姓名如"邱祥文"独立成行被误判为标题）。
    // 命中后剩余部分只允许少量符号（图标前缀等），不允许成段内容——头部区"姓名+求职意向"组合
    // （如"董琳琳求职意向：营销策划"）含 6 个剩余汉字会被拒绝
    const lowerText = sameColText.toLowerCase()
    const matchedKw = SECTION_TITLE_KEYWORDS.find((kw) => lowerText.includes(kw.toLowerCase()))
    if (!matchedKw) continue
    const leftoverHanChars = sameColText.replace(matchedKw, '').replace(/[^一-鿿]/g, '').length
    if (leftoverHanChars > 2) continue

    const key = `${column}-${Math.round(y)}`
    bannersByKey.set(key, { text: sameColText, y, column })
  }

  // 4. 验证：banner 下方同列有 ≥ MIN_ITEMS_BELOW 个 item
  const leftItems = items.filter(isLeftCol)
  const rightItems = boundary !== null ? items.filter((it) => !isLeftCol(it)) : items

  const validate = (banner: SectionBanner): boolean => {
    const colItems = banner.column === 'left' ? leftItems : rightItems
    return colItems.filter((it) => it.y < banner.y).length >= MIN_ITEMS_BELOW
  }

  // 5. 输出：Y 降序（视觉自上而下）
  return Array.from(bannersByKey.values())
    .filter(validate)
    .sort((a, b) => b.y - a.y)
}

/**
 * 稳健 X 跨度：取 item 中心点 p10-p90（<10 项时取全范围）。
 * 剔除离群 item（孤立符号如泄漏串残留 ~、装饰文本会把跨度拉大导致误判）。
 */
function robustColumnSpan(items: PositionedTextItem[]): number {
  const centers = items.map((it) => it.x + it.w / 2).sort((a, b) => a - b)
  if (centers.length === 0) return 0
  if (centers.length < 10) return centers[centers.length - 1] - centers[0]
  return (
    centers[Math.floor(centers.length * 0.9)] - centers[Math.floor(centers.length * 0.1)]
  )
}

/**
 * 按 banner 列表切分一列为多个 section。
 * 每个 banner 引领从其 Y 到下一个 banner Y 之间的内容；最后一个 banner 引领到列尾。
 * 无 banner 时整列作为单个 section。
 */
function splitByBanners(
  items: PositionedTextItem[],
  banners: SectionBanner[]
): { banner: SectionBanner | null; items: PositionedTextItem[] }[] {
  if (banners.length === 0) return [{ banner: null, items }]

  // banners 按 Y 降序排列（视觉自上而下）
  const sortedBanners = [...banners].sort((a, b) => b.y - a.y)
  const sections: { banner: SectionBanner | null; items: PositionedTextItem[] }[] = []

  // 首段：banner 列表之前的内容（Y 大于第一个 banner，即视觉上在最上面）。
  // 并入第一个 banner section（如 sidebar 顶部的姓名，视觉上属于首个区块），不单独成 section
  const firstBannerY = sortedBanners[0].y
  const headItems = items.filter((it) => it.y > firstBannerY)

  // 中间段：每个 banner 引领到下一个 banner 之间的内容
  for (let i = 0; i < sortedBanners.length; i++) {
    const cur = sortedBanners[i]
    const next = sortedBanners[i + 1]
    const sectionItems = items.filter(
      (it) => it.y < cur.y && (next === undefined || it.y > next.y)
    )
    if (sectionItems.length > 0) {
      sections.push({ banner: cur, items: sectionItems })
    }
  }

  if (headItems.length > 0) {
    // 启发式分流：
    //   - head ≤ 1 项（通常是孤立的"姓名"）→ 合并到首个 banner section，保持"姓名作为首块开头"
    //   - head ≥ 2 项（完整基本信息块：姓名+求职意向+电话+邮箱等）→ 独立成段置于最前，
    //     避免首个 banner（如"个人优势"）错误地出现在基本信息之前
    if (headItems.length === 1 && sections.length > 0) {
      sections[0].items = [...headItems, ...sections[0].items]
    } else {
      sections.unshift({ banner: null, items: headItems })
    }
  }

  return sections
}

/**
 * 按布局编列：识别 sidebar，按视觉 Y 顺序交错 main / sidebar 区块输出。
 * 详见 docs/superpowers/specs/2026-08-06-pdf-section-banner-detection-design.md
 */
function composeByLayout(
  items: PositionedTextItem[],
  boundary: number | null,
  banners: SectionBanner[]
): string {
  const isLeftCol = (it: PositionedTextItem): boolean =>
    boundary !== null && it.x + it.w / 2 < boundary
  const leftItems = items.filter(isLeftCol)
  const rightItems = boundary !== null ? items.filter((it) => !isLeftCol(it)) : items

  // 1. 单栏场景：直接按 banner 切分输出
  if (boundary === null) {
    // 兜底：真实 banner 为空时按日期行聚类 + 关键词推断
    const eff = banners.length > 0 ? banners : inferBannersFromLayout(items, buildRows(items), 'right')
    return composeColumnSections(rightItems, eff, 'right')
  }

  // 2. 双栏场景：识别 sidebar（宽度更窄的一侧，用稳健跨度与列检测口径一致）
  const leftWidth = robustColumnSpan(leftItems)
  const rightWidth = robustColumnSpan(rightItems)
  const sidebarIsLeft =
    leftWidth > 0 && leftWidth < rightWidth * SIDEBAR_WIDTH_RATIO
  const sidebar = sidebarIsLeft ? leftItems : rightItems
  const main = sidebarIsLeft ? rightItems : leftItems
  const sidebarCol: 'left' | 'right' = sidebarIsLeft ? 'left' : 'right'
  const mainCol: 'left' | 'right' = sidebarIsLeft ? 'right' : 'left'

  // 兜底：真实 banner 为空时,基于 main 列日期行聚类推断
  const effectiveBanners = banners.length > 0
    ? banners
    : inferBannersFromLayout(main, buildRows(main), mainCol)

  // 3. 按 banner 切分 main 与 sidebar
  //    若 sidebar 主要是日期区间（≥50%），改走"回流到 main 对应行"路径，
  //    避免表格型简历的日期脱离公司条目（详见 composeWithSidebarDateMerge）
  const mainSections = splitByBanners(main, effectiveBanners.filter((b) => b.column === mainCol))
  const sidebarTextItems = sidebar.filter((it) => it.str.trim().length > 0)
  const sidebarIsMostlyDates =
    sidebarTextItems.length > 0 &&
    sidebarTextItems.filter((it) => isDateRangeItem(it.str)).length / sidebarTextItems.length >= 0.5

  if (sidebarIsMostlyDates) {
    return composeWithSidebarDateMerge(main, sidebar, effectiveBanners, mainCol)
  }

  const sidebarSections = splitByBanners(sidebar, effectiveBanners.filter((b) => b.column === sidebarCol))

  type Section = { banner: SectionBanner | null; items: PositionedTextItem[]; column: 'left' | 'right' }
  const allSections: Section[] = [
    ...mainSections.map((s) => ({ ...s, column: mainCol })),
    ...sidebarSections.map((s) => ({ ...s, column: sidebarCol })),
  ]

  // 4. 排序：head section（无 banner）始终排在最前（语义上头部信息应在顶部），
  //    其余按 Y 降序。head 内部按 Y 降序，banner 之间按 Y 降序。
  allSections.sort((a, b) => {
    const aIsHead = a.banner === null
    const bIsHead = b.banner === null
    if (aIsHead && !bIsHead) return -1
    if (!aIsHead && bIsHead) return 1
    const aY = a.banner?.y ?? a.items[0]?.y ?? 0
    const bY = b.banner?.y ?? b.items[0]?.y ?? 0
    return bY - aY
  })

  // 5. 逐 section 输出
  return allSections
    .map((s) => {
      const header = s.banner ? s.banner.text + '\n' : ''
      return header + rowsToText(buildRows(s.items))
    })
    .join('\n')
}

/**
 * 单栏场景的输出：直接按 banner 切分输出
 */
function composeColumnSections(
  items: PositionedTextItem[],
  banners: SectionBanner[],
  column: 'left' | 'right'
): string {
  const sections = splitByBanners(items, banners.filter((b) => b.column === column))
  return sections
    .map((s) => {
      const header = s.banner ? s.banner.text + '\n' : ''
      return header + rowsToText(buildRows(s.items))
    })
    .join('\n')
}

/**
 * 启发式 banner 推断：当 PDF 文本层缺失 banner 字号（section 标题以粗体/图像
 * 渲染未被 pdfjs 抽取）时，按日期行内容分类聚类补全 banner。仅作为
 * findSectionBanners 返回空时的兜底，真实 banner 优先。
 *
 * 分类规则（基于条目文本）：
 *   - 含 "实习" → internship
 *   - 含学校关键词（大学/学院/学校） + 日期跨度 ≥ 3 年 → education
 *   - 含学校关键词 + 跨度 < 3 年 → campus
 *   - 其它 → work
 *
 * 分组规则：相邻同类型条目合并为一组；混合 internship + campus 组 → "实习及校园实践经历"。
 * 末尾跟 ≥ 2 条 ● 项目但无日期的行 → 追加 "自我评价" banner。
 */
function inferBannersFromLayout(
  items: PositionedTextItem[],
  rows: PositionedTextItem[][],
  column: 'left' | 'right'
): SectionBanner[] {
  const isDateRow = (row: PositionedTextItem[]): boolean => {
    // 用整行拼接文本做匹配,容忍 pdfjs 把"2025" 拆成"20"+"25.07-2026.05" 等情况
    // 分隔符支持 - ~ 到 至 以及 "--"(双减号)、en/em dash 等模板简历常见写法
    const text = row.map((it) => it.str).join('').trim()
    return /^\d{0,2}\d{4}[.\-/年]?\d{0,2}[月日]?\s*[-~到至—–]+\s*\d{4}/.test(text)
  }

  type EntryType = 'education' | 'work' | 'internship' | 'campus'
  const classifyEntry = (row: PositionedTextItem[]): EntryType => {
    const text = row.map((it) => it.str).join(' ')
    if (/实习|实习生/.test(text)) return 'internship'
    // 学位关键词直接判 education（不受 3 年跨度限制，应对专科/专升本/2 年制等）
    if (/本科|硕士|博士|专科|MBA|PhD/.test(text)) return 'education'
    if (/大学|学院|学校|学生会|团支部|班级|校园/.test(text)) {
      const m = text.match(/(\d{4})[.\-/]\d{1,2}.*?[-~到至—–]+(\d{4})[.\-/]\d{1,2}/)
      if (m) {
        const span = parseInt(m[2]) - parseInt(m[1])
        if (span >= 3) return 'education'
      }
      return 'campus'
    }
    return 'work'
  }

  // 0. 检测 findSectionBanners 漏掉的真实 banner 项（字号略大于正文 + 命中
  //    SECTION_TITLE_KEYWORDS + 独占行）。
  //    原固定阈值 h>=13.5 对部分 PDF 过严：如 banner h=12、正文 h=10.45（ratio 1.15），
  //    未达 findSectionBanners 的 1.3 倍阈值，真实 section 标题被当普通文本输出，
  //    其下日期行被 classifyEntry 误判类型并推断出错误 banner（如"在校经历"下的
  //    公益活动被推断成"工作经历"）。改为基于正文中位数的 ratio 阈值（1.1）+ 独占行，
  //    识别这些略大标题后，相近的推断 banner 会被 30pt 容差去重跳过，标题辖域内的
  //    日期行不再被误推断。吴榆杰等全 h=10.45 的 PDF（medianH*1.1≈11.5）不受影响。
  // 0. 检测 findSectionBanners 漏掉的真实 banner 项（命中 SECTION_TITLE_KEYWORDS
  //    + 独占行 + 字号不低于正文中位数）。
  //    findSectionBanners 用 1.3 倍正文字高识别 banner，对部分 PDF 过严：如 banner
  //    h=12、正文 h=11.05（ratio 仅 1.09）时，1.3 倍阈值（14.37）识别不到，真实
  //    section 标题被当普通文本输出，其下日期行被 classifyEntry 误判类型并推断出
  //    错误 banner（如"在校经历"下的公益活动被推断成"工作经历"）。
  //    此处字号阈值放宽到 >= 正文中位数（排除小字注释），主要靠白名单 + 独占行 +
  //    短文本区分标题与正文。识别这些真实标题后，相近的推断 banner 会被 30pt 容差
  //    去重跳过，标题辖域内的日期行不再被误推断。吴榆杰等 banner 文本不在文本层
  //    的 PDF，realBanners 仍为空，不影响其 classifyEntry 推断路径。
  const heights = items.map((it) => it.h).sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)] || 10
  const realBanners: SectionBanner[] = items
    .filter((it) => {
      if (it.h < medianH) return false
      const s = it.str.trim()
      if (s.length === 0 || s.length > 12) return false
      if (!SECTION_TITLE_KEYWORDS.some((kw) => s.toLowerCase().includes(kw.toLowerCase()))) return false
      // 独占行：所在视觉行仅此一个非空文本项（标题通常独占一行，防正文描述误判）
      const row = rows.find((r) => r.includes(it))
      return row ? row.filter((x) => x.str.trim().length > 0).length === 1 : false
    })
    .map((it) => ({ text: it.str.trim(), y: it.y, column }))

  // 1. 收集日期行 + 类型
  const dated: { idx: number; type: EntryType }[] = []
  rows.forEach((row, i) => {
    if (isDateRow(row)) dated.push({ idx: i, type: classifyEntry(row) })
  })
  if (dated.length === 0) return realBanners

  // 2. 按类型连续性分组
  const groups: { type: EntryType; idxs: number[] }[] = []
  let curType: EntryType | null = null
  let curIdxs: number[] = []
  for (const { idx, type } of dated) {
    if (type === curType) {
      curIdxs.push(idx)
    } else {
      if (curType !== null) groups.push({ type: curType, idxs: curIdxs })
      curType = type
      curIdxs = [idx]
    }
  }
  if (curType !== null) groups.push({ type: curType, idxs: curIdxs })

  // 3. 合并：相邻的 [internship] + [campus] → 单一 "实习及校园实践经历" 组
  //    （原 PDF 习惯合并为单一 banner）
  const merged: { types: Set<EntryType>; idxs: number[] }[] = []
  for (const g of groups) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      ((g.type === 'campus' && prev.types.has('internship')) ||
        (g.type === 'internship' && prev.types.has('campus')))
    ) {
      prev.types.add(g.type)
      prev.idxs.push(...g.idxs)
    } else {
      merged.push({ types: new Set([g.type]), idxs: g.idxs })
    }
  }

  // 4. 类型 → 标题
  const groupTitle = (types: Set<EntryType>): string => {
    if (types.size === 1) {
      const t = types.values().next().value as EntryType
      if (t === 'education') return '教育背景'
      if (t === 'work') return '工作经历'
      if (t === 'internship') return '实习经历'
      if (t === 'campus') return '校园经历'
    }
    if (types.has('internship') && types.has('campus')) return '实习及校园实践经历'
    return '工作经历'
  }

  const inferredBanners: SectionBanner[] = []
  for (const g of merged) {
    const firstY = rows[g.idxs[0]][0].y
    const bannerY = firstY + 12 // banner 置于首个日期行之上（PDF Y 增 = 视觉上移）
    inferredBanners.push({ text: groupTitle(g.types), y: bannerY, column })
  }

  // 5. 尾部自我评价：扫描最后一个日期行后所有 ● bullet 行，按 Y gap 分组取最后一组
  //    （最后一组通常是独立 section，校园条目描述在前、 ● 自我评价条目在后）
  const lastDateRowIdx = dated[dated.length - 1].idx
  const bulletRowIdxs: number[] = []
  for (let i = lastDateRowIdx + 1; i < rows.length; i++) {
    const text = rows[i].map((it) => it.str).join('').trim()
    // row 内 PUA 字符在 rowsToText 输出时才被替换为 ●，这里直接检测 PUA 或 ●
    if (/^[●-]/.test(text)) bulletRowIdxs.push(i)
  }
  if (bulletRowIdxs.length >= 2) {
    const BULLET_GAP_THRESHOLD = 40
    const groups: number[][] = []
    let curGroup = [bulletRowIdxs[0]]
    for (let j = 1; j < bulletRowIdxs.length; j++) {
      const gap = rows[bulletRowIdxs[j - 1]][0].y - rows[bulletRowIdxs[j]][0].y
      if (gap > BULLET_GAP_THRESHOLD) {
        groups.push(curGroup)
        curGroup = [bulletRowIdxs[j]]
      } else {
        curGroup.push(bulletRowIdxs[j])
      }
    }
    groups.push(curGroup)

    const lastGroup = groups[groups.length - 1]
    if (lastGroup.length >= 2) {
      // 若真实 banner 或 items 中已有 "自我评价" 类标题,跳过推断避免重复
      const hasSelfEval =
        realBanners.some((r) => /自我评价|个人评价|自我描述|自我简介/.test(r.text)) ||
        items.some((it) => /自我评价|个人评价|自我描述|自我简介/.test(it.str))
      if (!hasSelfEval) {
        inferredBanners.push({
          text: '自我评价',
          y: rows[lastGroup[0]][0].y + 12,
          column,
        })
      }
    }
  }

  // 6. 合并真实 banner 与推断 banner：真实 banner 优先
  //    比较 inf.y 与 r.y：30pt 容差内视为同一 section 的 banner
  //    另：若 items 中已有与推断同名的真实文本项（如 h=10.45 的常规大小 banner），
  //    也跳过对应推断避免 "教育经历 + 教育背景" 双重 banner
  const mergedBanners: SectionBanner[] = [...realBanners]
  for (const inf of inferredBanners) {
    const close = realBanners.some((r) => Math.abs(r.y - inf.y) < 30)
    // 同一核心语义（如 "教育经历" vs "教育背景"）的真实 banner 已存在 → 跳过推断
    // 兼容真实 banner 在 items 中（h=10.45）而非 realBanners 中
    const stripSuffix = (s: string) => s.replace(/(经历|背景|情况|信息|优势|特长|特长|描述|简介)$/g, '')
    const sameMeaning =
      realBanners.some((r) => stripSuffix(r.text) === stripSuffix(inf.text)) ||
      items.some((it) => {
        const t = it.str.trim()
        if (t.length === 0 || t.length > 12) return false
        return stripSuffix(t) === stripSuffix(inf.text)
      })
    if (!close && !sameMeaning) mergedBanners.push(inf)
  }
  return mergedBanners
}

/**
 * 检测是否为日期区间字符串。覆盖常见简历写法：
 *   2026.03-2026.05、2025/10-2026/02、2021-2025、2026年03月-2026年05月、
 *   2024.09-2024.10，以及模板简历常见的 "2022.09 -- 2026.06"（双减号）、
 *   en/em dash 分隔等。
 * 用于"sidebar 主要是日期"判定，触发回流合并。
 */
function isDateRangeItem(str: string): boolean {
  const t = str.trim()
  return /^\d{4}([.\-/年]\d{1,2}([月]\d{0,2}[日]?)?)?\s*[-~到至—–]+\s*\d{4}([.\-/年]\d{1,2}([月]\d{0,2}[日]?)?)?/.test(t)
}

/**
 * 表格式布局回流：把 sidebar item 按 Y 容差（行高 / 2）匹配到 main 对应行，
 * 追加到行尾（行内 X 升序）。未匹配的 sidebar item 按 Y 顺序追加到末尾作为
 * 残留段，避免信息丢失。
 *
 * 背景：列检测把"右列日期 / 左列公司"误判为 sidebar+main 布局，sidebar
 * 被作为独立 section 输出导致日期与公司脱离。本函数仅在 sidebar 主要是
 * 日期区间（≥50%）时调用，保护真正的 sidebar 简历（联系方式/技能栏）走原逻辑。
 */
function composeWithSidebarDateMerge(
  main: PositionedTextItem[],
  sidebar: PositionedTextItem[],
  banners: SectionBanner[],
  mainCol: 'left' | 'right'
): string {
  const mainBanners = banners.filter((b) => b.column === mainCol)
  const mainSections = splitByBanners(main, mainBanners)

  // 1. 切 main 为多个 banner section，每个 section 内部构建视觉行
  const sectionsWithRows = mainSections.map((s) => ({
    banner: s.banner,
    rows: buildRows(s.items),
  }))

  // 2. 对每个 sidebar item，Y 容差匹配到最近的 main 行，追加并按 X 升序
  const unmatched: PositionedTextItem[] = []
  for (const sItem of sidebar) {
    let bestRow: PositionedTextItem[] | null = null
    let bestDist = Infinity
    for (const sec of sectionsWithRows) {
      for (const row of sec.rows) {
        const tol = Math.max(...row.map((it) => it.h)) / 2
        const dist = Math.abs(row[0].y - sItem.y)
        if (dist <= tol && dist < bestDist) {
          bestDist = dist
          bestRow = row
        }
      }
    }
    if (bestRow) {
      bestRow.push(sItem)
      bestRow.sort((a, b) => a.x - b.x)
    } else {
      unmatched.push(sItem)
    }
  }

  // 3. 按原顺序输出；未匹配的 sidebar 残留作为附加段
  const outputs = sectionsWithRows.map((sec) => {
    const header = sec.banner ? sec.banner.text + '\n' : ''
    const rowText = sec.rows.map((row) => row.map((it) => it.str).join('')).join('\n')
    return header + rowText
  })
  let result = outputs.join('\n')
  if (unmatched.length > 0) {
    result += '\n' + rowsToText(buildRows(unmatched))
  }
  return result
}

/**
 * 按视觉阅读顺序提取 PDF 文本
 *
 * v2 重载：调用方传 { includeStats: true } 时返回 { text, stats }（stats 为文字层破碎统计）；
 * 不传则返回纯字符串，行为与 v1 完全一致。
 */
export function extractTextByVisualOrder(
  buffer: Buffer,
  options: VisualExtractOptions & { includeStats: true }
): Promise<{ text: string; stats: FragmentationStats }>
export function extractTextByVisualOrder(
  buffer: Buffer,
  options?: VisualExtractOptions
): Promise<string>
export async function extractTextByVisualOrder(
  buffer: Buffer,
  options?: VisualExtractOptions
): Promise<string | { text: string; stats: FragmentationStats }> {
  const maxPages = options?.maxPages ?? 50
  const pageTexts: string[] = []

  // v2: 文字层破碎统计（跨页累计 + 单页最大值诊断）
  const stats: FragmentationStats = {
    totalItems: 0,
    emptyItems: 0,
    singleCharItems: 0,
    emptyItemRatio: 0,
    singleCharItemRatio: 0,
    maxPageEmptyRatio: 0,
    maxPageSingleCharRatio: 0,
  }

  // 动态 import：pdfjs-dist v4 在模块顶层调用 process.getBuiltinModule，
  // 必须在上述模块顶层 polyfill 执行之后才加载
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // 关闭 pdfjs-dist 默认 verbose 日志（生产环境必须，视觉路径频繁触发避免污染 console）。
  // 注意：不能用 (pdfjs as any).Verbosity = 0 —— ESM 模块命名空间冻结不可赋值，
  // 需通过 getDocument 参数 verbosity 关闭（pdfjs Verbosity: 0=errors, 1=warnings, 2=infos）
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
  })
  const pdf = await loadingTask.promise

  try {
    const totalPages = Math.min(pdf.numPages, maxPages)

    for (let p = 1; p <= totalPages; p++) {
      options?.onProgress?.(p, totalPages)

      const page = await pdf.getPage(p)
      const content = await page.getTextContent()

      // 1. 转成带坐标的项，过滤空白项、非文本项和噪音项（字体子集泄漏片段 / 孤立 ~）
      // v2: 先统计页级破碎 metrics（先统计后过滤，空 item 不丢失）
      let pageTotal = 0
      let pageEmpty = 0
      let pageSingleChar = 0

      const items: PositionedTextItem[] = content.items
        .map((item) => {
          const str = (item as { str?: string }).str ?? ''
          if (str.trim().length === 0) {
            pageEmpty++
            pageTotal++
            return null
          }
          if (isNoiseItem(str)) return null // 字体子集泄漏串不计入破碎度
          if (str.trim().length === 1) pageSingleChar++
          pageTotal++
          const transform = (item as { transform?: number[] }).transform ?? [1, 0, 0, 1, 0, 0]
          return {
            str,
            x: transform[4],
            y: transform[5],
            h: (item as { height?: number }).height || transform[3] || 10, // 字体高度
            w: (item as { width?: number }).width || 0, // 字符宽度（列检测中心计算用）
          }
        })
        .filter((it): it is PositionedTextItem => it !== null)

      // v2: 按页归并到全局 stats，并更新单页最大值（诊断用，不参与触发判定）
      if (pageTotal > 0) {
        stats.totalItems += pageTotal
        stats.emptyItems += pageEmpty
        stats.singleCharItems += pageSingleChar
        const pageEmptyRatio = pageEmpty / pageTotal
        const pageSingleCharRatio = pageSingleChar / pageTotal
        if (pageEmptyRatio > stats.maxPageEmptyRatio) stats.maxPageEmptyRatio = pageEmptyRatio
        if (pageSingleCharRatio > stats.maxPageSingleCharRatio) stats.maxPageSingleCharRatio = pageSingleCharRatio
      }

      if (options?.includeStats && pageTotal > 0) {
        console.log(
          `[VisualExtractor] page=${p}, pageTotal=${pageTotal}, pageEmpty=${pageEmpty}(${((pageEmpty / pageTotal) * 100).toFixed(1)}%), ` +
          `pageSingleChar=${pageSingleChar}(${((pageSingleChar / pageTotal) * 100).toFixed(1)}%)`
        )
      }

      if (items.length === 0) continue

      // 2. 构建视觉行
      const rows = buildRows(items)

      // 3. 双栏列检测
      const boundary = findColumnBoundary(rows)

      // 4. 区块标题识别
      const banners = findSectionBanners(items, rows, boundary)

      // 5. 按布局编列（单栏 / 双栏 / sidebar+main 统一处理）
      const pageText = composeByLayout(items, boundary, banners)

      // 生产校准打点：列检测与 banner 命中时记录，便于后续抽查回归
      if (boundary !== null || banners.length > 0) {
        console.log(
          `[VisualExtractor] page=${p}, boundary=${boundary !== null ? Math.round(boundary) : 'null'}, ` +
          `banners=${banners.length}个[${banners.map((b) => `${b.column}:${b.text}`).join(', ')}], 行数=${rows.length}`
        )
      }

      pageTexts.push(pageText)
    }
  } finally {
    // 释放 PDF 文档资源（忽略清理错误，不影响提取结果）
    try {
      await pdf.destroy()
    } catch {
      // 忽略
    }
  }

  const text = pageTexts.join('\n\n')

  if (options?.includeStats) {
    // v2: 计算跨页累计比值
    stats.emptyItemRatio = stats.totalItems > 0 ? stats.emptyItems / stats.totalItems : 0
    stats.singleCharItemRatio = stats.totalItems > 0 ? stats.singleCharItems / stats.totalItems : 0
    return { text, stats }
  }

  return text
}

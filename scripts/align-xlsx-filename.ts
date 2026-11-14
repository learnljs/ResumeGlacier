/**
 * 对齐 xlsx 文件名到 HR 数据库格式（TypeScript 版，生产环境用）
 *
 * 把"简历附件"列替换成 HR 对应 Resume 的 fileName，生成新 xlsx，
 * 使后续回填能用精准匹配（文件名完全相等）。
 *
 * 匹配逻辑：文件名（规范化）优先，匹配上则不再用姓名兜底（避免同名不同人错配）；
 * 仅文件名匹配失败时才用姓名兜底。
 *
 * 用法：
 *   npx tsx scripts/align-xlsx-filename.ts <输入xlsx> <输出xlsx>
 */
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'

// 文件名规范化：提取 (岗位, 候选人)，忽略城市/薪资/年限/分隔符/扩展名差异
function normalizeFilename(filename: string | null | undefined): [string, string] | null {
  if (!filename) return null
  const s = filename.trim()
  const m = s.match(/^【([^】]+)】/)
  if (!m) return null
  const position = m[1].split('_')[0].trim()
  let rest = s.slice(m[0].length)
  rest = rest.replace(/\.(pdf|jpe?g|png|docx?)$/i, '')
  rest = rest.replace(/\d+年(以内|以上|应届生|毕业)?/g, '')
  rest = rest.replace(/一+年(以内|以上)?/g, '')
  rest = rest.replace(/十+\d*年(以上)?/g, '')
  rest = rest.replace(/[（(][^)）]*[)）]/g, '')
  rest = rest.replace(/[_\s]+/g, '')
  const name = rest.trim()
  if (!position || !name) return null
  return [position, name]
}

function extractNameFromFile(filename: string | null | undefined): string | null {
  if (!filename) return null
  const m = filename.match(/^【[^】]+】\s*(.+?)(?:\s+\S*)?$/)
  if (!m) return null
  let rest = m[1]
  rest = rest.replace(/\.(pdf|jpe?g|png|docx?)$/i, '')
  const parts = rest.split(/\s+/).filter(Boolean)
  return parts[0]?.trim() || null
}

function extractPosition(filename: string | null | undefined): string | null {
  if (!filename) return null
  const m = filename.match(/^【([^】]+)】/)
  if (!m) return null
  const inner = m[1]
  return inner.includes('_') ? inner.split('_')[0].trim() : inner.trim()
}

async function main() {
  const inputPath = process.argv[2]
  const outputPath = process.argv[3]
  if (!inputPath || !outputPath) {
    console.error('用法: npx tsx scripts/align-xlsx-filename.ts <输入xlsx> <输出xlsx>')
    process.exit(1)
  }

  // 1. 读 xlsx
  const wb = XLSX.readFile(inputPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
  const xlsxData: Array<[string, string, string]> = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = r[0]?.toString().trim()
    const file = r[1]?.toString().trim() || ''
    const rid = r[2]?.toString().trim()
    if (name && rid) xlsxData.push([name, file, rid])
  }
  console.log(`xlsx 读入：${xlsxData.length} 条`)

  // 2. 读 HR
  const resumes = await prisma.resume.findMany({
    select: { id: true, candidateName: true, fileName: true, positionId: true },
  })
  const byNormfile = new Map<string, any[]>()
  for (const r of resumes) {
    const nf = normalizeFilename(r.fileName)
    if (nf) {
      const key = nf.join('|')
      if (!byNormfile.has(key)) byNormfile.set(key, [])
      byNormfile.get(key)!.push(r)
    }
  }
  const byName = new Map<string, any[]>()
  for (const r of resumes) {
    if (r.candidateName) {
      if (!byName.has(r.candidateName)) byName.set(r.candidateName, [])
      byName.get(r.candidateName)!.push(r)
    }
  }
  const frs = await prisma.followUpRecord.findMany({
    include: {
      evaluation: { include: { position: true } },
      resume: { select: { position: true } },
    },
  })
  const frByResume = new Map<string, any[]>()
  for (const fr of frs) {
    if (!frByResume.has(fr.resumeId)) frByResume.set(fr.resumeId, [])
    frByResume.get(fr.resumeId)!.push(fr)
  }

  // 3. 匹配（文件名优先，匹配上不兜底；失败才姓名兜底）
  function findCandidateResumes(name: string, file: string): Array<{ resume: any; src: string }> {
    const cands: Array<{ resume: any; src: string }> = []
    const seen = new Set<string>()
    const nf = normalizeFilename(file)
    if (nf) {
      for (const r of byNormfile.get(nf.join('|')) || []) {
        if (!seen.has(r.id)) { cands.push({ resume: r, src: '文件名' }); seen.add(r.id) }
      }
    }
    if (cands.length > 0) return cands // 文件名已命中，不再兜底
    for (const r of byName.get(name) || []) {
      if (!seen.has(r.id)) { cands.push({ resume: r, src: '姓名' }); seen.add(r.id) }
    }
    const fn = extractNameFromFile(file)
    if (fn && fn !== name) {
      for (const r of byName.get(fn) || []) {
        if (!seen.has(r.id)) { cands.push({ resume: r, src: `附件名(${fn})` }); seen.add(r.id) }
      }
    }
    return cands
  }

  // 4. 对齐
  const results: Array<[string, string, string, string, string]> = []
  for (const [name, file, rid] of xlsxData) {
    const cands = findCandidateResumes(name, file)
    if (cands.length === 0) {
      results.push([name, file, rid, '未匹配-无候选人', file])
      continue
    }
    const allFrs: any[] = []
    for (const { resume, src } of cands) {
      for (const fr of frByResume.get(resume.id) || []) allFrs.push({ fr, resume, src })
    }
    const alignedFile = cands[0].resume.fileName || file
    if (allFrs.length === 0) {
      results.push([name, alignedFile, rid, '未匹配-无跟进记录', file])
    } else if (allFrs.length === 1) {
      results.push([name, allFrs[0].resume.fileName || alignedFile, rid, '已对齐-单fr', file])
    } else {
      const pos = extractPosition(file)
      let picked: any = null
      if (pos) {
        const hits = allFrs.filter((t: any) => {
          const evalTitle = t.fr.evaluation?.position?.title
          const resumeTitle = t.fr.resume?.position?.title
          return (evalTitle && (pos.includes(evalTitle) || evalTitle.includes(pos))) ||
            (resumeTitle && (pos.includes(resumeTitle) || resumeTitle.includes(pos)))
        })
        if (hits.length === 1) picked = hits[0]
      }
      if (picked) {
        results.push([name, picked.resume.fileName || alignedFile, rid, '已对齐-岗位消歧', file])
      } else {
        results.push([name, alignedFile, rid, `已对齐-多fr歧义(${allFrs.length}条)`, file])
      }
    }
  }

  // 5. 写对齐 xlsx
  const aoa: any[][] = [['候选人', '简历附件(对齐DB)', '记录ID', '匹配状态', '原附件名']]
  for (const r of results) aoa.push(r)
  const wsOut = XLSX.utils.aoa_to_sheet(aoa)
  const wbOut = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbOut, wsOut, '招聘进度管理')
  XLSX.writeFile(wbOut, outputPath)
  console.log(`\n新 xlsx 已生成：${outputPath}`)

  // 6. 验证
  const hrFiles = new Set(resumes.map((r) => r.fileName).filter(Boolean) as string[])
  const exact = results.filter((r) => r[1] && hrFiles.has(r[1])).length
  console.log(`\n精准匹配验证：${exact}/${results.length} 条文件名命中 HR fileName`)
  const statusDist: Record<string, number> = {}
  for (const r of results) statusDist[r[3]] = (statusDist[r[3]] || 0) + 1
  console.log('\n状态分布：')
  for (const [s, c] of Object.entries(statusDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${c}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

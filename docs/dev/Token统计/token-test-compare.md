# Token 测试对比汇总（阶段 1）

> 同岗位「跨境财税规划经理（管培生）」10 份简历，每模式 2 轮取均值。
> 模型：deepseek-v4-flash；reasoning_effort=none（reasoningTokens 全程为 0）。

## 一、4 轮原始汇总

| 指标 | batch r1 | batch r2 | indep r1 | indep r2 |
|------|----------|----------|----------|----------|
| 总耗时 | 66.7s | 78.7s | 242.4s | 230.5s |
| 总输入 token | 83,081 | 82,714 | 82,667 | 82,562 |
| 总输出 token | 41,846 | 42,423 | 42,287 | 42,342 |
| 总 token | 124,927 | 125,137 | 124,954 | 124,904 |
| extraction 缓存命中率 | 97.9% | 97.9% | 97.9% | 97.9% |
| screening 缓存命中率 | 98.4% | 98.6% | 98.5% | 98.4% |
| 平均单份总 token | 12,493 | 12,514 | 12,495 | 12,490 |
| 平均 screening API 往返 | 14,086ms | 14,678ms | 15,120ms | 14,914ms |
| 平均 extraction API 往返 | 4,636ms | 4,850ms | 4,715ms | 4,826ms |

## 二、批次 vs 独立对比（2 轮均值）

| 指标 | batch 均值 | independent 均值 | 差异 | 差异% |
|------|-----------|-----------------|------|-------|
| 总耗时 | 72.7s | 236.5s | batch 快 163.8s | **batch 快 69.2%** |
| 总输入 token | 82,898 | 82,615 | +283 | +0.34%（噪声） |
| 总输出 token | 42,135 | 42,315 | -180 | -0.43%（噪声） |
| 总 token | 125,032 | 124,929 | +103 | +0.08%（噪声） |
| extraction 缓存命中率 | 97.9% | 97.9% | 0 | — |
| screening 缓存命中率 | 98.5% | 98.5% | 0 | — |
| 平均单份总 token | 12,503 | 12,493 | +10 | +0.08%（噪声） |

## 三、Token 消耗构成（按环节，10 份均值）

| 环节 | 输入 token | 输出 token | 总 token | 占比 | 缓存命中 |
|------|-----------|-----------|---------|------|---------|
| extraction | 23,272 | 8,894 | 32,166 | 25.7% | 97.9% |
| screening | 59,609 | 33,441 | 93,050 | 74.3% | 98.5% |
| **合计** | **82,881** | **42,335** | **125,216** | 100% | 98.3% |

- 输入 token : 输出 token ≈ 2 : 1（输入是大头，因 system prompt 固定较大）
- screening 是 token 消耗主体（74.3%），且输出 token 占比高（screening 输出 33k vs extraction 9k）
- 缓存命中率极高（98.3%），实际未命中输入 token 仅约 1,410

## 四、耗时瓶颈分析

| 环节 | 平均 API 往返 | 平均本地处理 | API 占比 |
|------|-------------|-------------|---------|
| extraction | ~4.76s | ~0ms | ≈100% |
| screening | ~14.70s | ~15ms | ≈100% |
| 单份合计 | ~19.5s（API） | ~15ms（本地） | API 占绝对主导 |

- **瓶颈完全在 AI API 往返**，本地处理（组装 prompt + 校验 + DB 写）仅 15ms，可忽略
- screening 耗时是 extraction 的 3 倍（14.7s vs 4.8s），与输出 token 量正相关（screening 输出更长）
- batch 模式总耗时 72.7s vs independent 236.5s：差异来自**并发**（batch 筛选并发 2 + 解析并发 1）vs independent 严格串行；**与 token 无关**

## 五、关键发现

### 发现 1：缓存让 batch 与 independent 的 token 消耗无差异（+0.08%）
DeepSeek 自动 context caching 在两种模式下命中率均 98.3%+，未命中输入 token 几乎相同。**批次 vs 独立在 token 成本上无优势**——因为 system prompt 固定，缓存自动命中，无论串行还是并发。原假设"批次能省 token"被证伪。

### 发现 2：batch 的唯一优势是时间（快 69.2%），来自并发
batch 总耗时 72.7s，independent 236.5s。差异完全来自并发度（batch 筛选并发 2），与缓存/ token 无关。**若要降时间，提并发是唯一直接杠杆**（受 SQLite 单写 + API 限速约束）。

### 发现 3：reasoning token 全程为 0（确认）
`reasoning_effort: 'none'` 生效，无隐藏思考链成本。

### 发现 4：max_tokens=8000 截断是真实偶发风险（系统级）
4 轮中每轮都有 1 份简历 screening 触顶 8000（finishReason="length"）→ JSON 截断 → ERROR。测试装置已加重试自动恢复。**生产系统应考虑**：提高 max_tokens、或截断容错（部分 JSON 修复）、或约束输出长度。同一份简历有时输出 2200 token 正常、有时膨胀到 8000，属模型输出长度方差问题。

### 发现 5：本地处理几乎零开销
extraction localMs=0，screening localMs≈15ms。瓶颈 100% 在 API，优化本地代码无收益。

## 六、阶段 2 讨论输入

1. **Token 优化空间有限**：98.3% 缓存命中已近极限，未命中输入仅 1,410 token。进一步省 token 需从 prompt 本身瘦身（system prompt 是输入大头）。
2. **时间优化 = 提并发**：batch 已比 independent 快 3.3 倍。SCREENING_CONCURRENCY 从 2 提到 4-6 可进一步降时（待阶段 3 容量测试验证 SQLite/API 限速边界）。
3. **稳定性优化**：max_tokens=8000 截断需处理（提高阈值或容错），否则约 10% 简历会偶发筛选失败。
4. **成本估算**：单份简历约 12,500 token（输入 8,288 + 输出 4,234），deepseek-v4-flash 缓存价约为常价 1/10，单份实际成本极低（约 ¥0.00x）。

## 七、附录：screening 输出 token 构成

screening 的输出 token（`completionTokens`）即 AI 按 `response_format: json_object` 生成的 JSON，结构由 `prompt-assembler.ts` 的 `generateJsonTemplate` 锁死：

```jsonc
{
  "knowledge": {                  // 知识维度
    "star": 4,                    // 1-5 星
    "comment": "<维度评语>",
    "scoringApplied": "<如何套用评分规则得出该星级>",
    "directions": [               // 每个方向
      {
        "name": "<方向名>",
        "star": 4,
        "comment": "<方向评语>",
        "questions": [            // 每道题
          { "key": "1.1", "text": "<题面>", "answer": true, "evidence": "<简历原文或null>" }
        ]
      }
    ]
  },
  "skill": { ... },               // 技能维度，结构同 knowledge
  "summary": "<整体评价>",
  "strengths": ["<优势>"],
  "weaknesses": ["<不足>"],
  "extracted_tags": ["大厂背景", "管理经验"]
}
```

各部分 token 权重：

| 部分 | 内容 | token 权重 |
|------|------|-----------|
| `knowledge/skill.directions[].questions[].evidence` | 每题引用的简历原文证据 | **最大**--题数 × 每段原文 |
| `knowledge/skill.directions[].comment` + `scoringApplied` | 每方向评语 + 套规说明 | 中等 |
| `knowledge/skill.comment` + `scoringApplied` | 维度级评语 + 套规说明 | 中等 |
| `summary` / `strengths[]` / `weaknesses[]` | 整体评价 | 较小 |
| `star` / `answer` / `key` / `extracted_tags` | 数值/布尔/枚举 | 极小 |

即输出 token 量 ≈ **(知识方向数×题数 + 技能方向数×题数) × 每题证据长度** + 各层评语。这解释了发现 4 的方差现象：同一份简历有时输出 2200 token 正常、有时膨胀到 8000 触顶截断（`finishReason=length`），根因是模型在 `evidence` 引文长度与评语详略上的输出方差。

## 八、阶段二输出瘦身复测

### 方案

砍除 screening AI 输出 JSON 中的 7 个字段：
- `question.text`（题面回吐，14.4%）+ `direction.name`（方向名回吐，0.8%）：前端改从 `/api/prompts/questions` 按 key 取（A1 兼容：旧 aiDetail 有则用，新数据走 API）
- `scoringApplied`（套规说明，12.3%）：前端条件渲染自动隐藏
- `summary`（1.6%）+ `strengths`（1.5%）+ `weaknesses`（1.4%）：校验放宽为可选，存储 `?? ''`/`?? []`
- `direction.comment`（方向评语，6.0%）：前端条件渲染自动隐藏；**维度评语 `dim.comment` 保留**
- `evidence`/维度评语/星级保留（评分依据 + HR 阅读）
- key 容错：校验时按顺序重映射 `q.key`，保证前端按 key 对齐取题面可靠

不改评分逻辑（评分只用 star）、不改 DB schema。

### 复测结果（batch 模式，10 份）

分两步砍除：r3/r4 砍 6 字段（text/name/scoringApplied/summary/strengths/weaknesses），r5/r6 追加砍方向评语 `direction.comment`。

| 指标 | 阶段一 r1/r2 均值 | r3/r4 均值（砍6字段） | r5/r6 均值（砍7字段） | 累计变化 |
|------|-----------------|---------------------|---------------------|---------|
| 总耗时 | 72.7s | 41.5s | 39.1s* | -46% |
| screening 单份输出 | 3,344 | 1,418 | 1,199 | -64.2% |
| screening 输入:输出 | 1.78:1 | 3.29:1 | 3.83:1 | 接近 4:1 |
| screening API 往返 | 14.7s | 7.75s | 6.47s | -56% |
| screening 缓存命中 | 98.5% | 98.8% | 98.5% | 正常 |
| `finishReason=length` 截断 | 每轮 1 份 | 0 | 0 | 发现4根治 |

\* r5 47.9s（新 prompt 首次缓存 53%）+ r6 30.3s（缓存恢复 98.5%），均值 39.1s。新 prompt 首次跑的缓存冷启动让单轮耗时偏高，r6 恢复后 30.3s 是稳态。

### 关键修正：并发度归因

**阶段一报告「batch 筛选并发 2」是误述**。`.env` 一直是 `SCREENING_CONCURRENCY=10` / `PARSING_CONCURRENCY=5`，r1 的 screening 时间戳（前 9 份集中在 4 秒内）证明阶段一也是并发 10。报告作者基于 CLAUDE.md 默认值（2/1）假设，未实测 ts。

因此 r1/r2 -> r3/r4 的耗时降幅（72.7s -> 41.5s）**不来自提并发**，归因为：
1. **输出瘦身**：单份 screening API 14.7s -> 7.75s（输出短了生成快）
2. **截断根治**：r1 的 cmsg2t5ve 触顶 8000（`finishReason=length`，31980ms）+ 重试 13897ms；r4 同一份输出 1644 正常 stop。截断重试是 r1 耗时偏高的主因

### 截断根治实例

| 简历 | 阶段一 r1 | 阶段二 r4 |
|------|----------|----------|
| cmsg2t5ve | 输出 8000, `length` 截断, 31980ms + 重试 13897ms | 输出 1644, `stop`, 9317ms |

输出瘦身后，曾膨胀到 8000 的简历稳定在 ~1644，截断问题消失，无需单独修 max_tokens。

### 新 prompt 首次缓存冷启动

每次改 prompt 后首次跑 batch（r3 砍6字段、r5 砍方向评语），并发 10 个请求几乎同时打 DeepSeek，缓存未及建立 -> r3 全 miss(0%)、r5 部分命中(53%)。次轮（r4/r6）缓存建立后恢复 98.5%+。这是高并发首次新 prompt 的一次性现象，生产环境每次 prompt 变更后首次筛选也会如此，非持续故障。

### 阶段二成果

| 成果 | 来源 |
|------|------|
| screening 输出 -64.2%（3,344 -> 1,199） | 输出瘦身（7 字段） |
| 比例 1.78:1 -> 3.83:1（接近 4:1） | 输出瘦身 |
| 截断根治（0 份 length） | 输出瘦身 |
| screening API 往返 -56%（14.7s -> 6.47s） | 输出变短生成快 |
| 总耗时 -46%（72.7s -> 39.1s） | 输出瘦身 + 截断消失 |
| 10 并发稳定（无 SQLite 锁/API 429） | 既有 .env，r3-r6 验证 |

### A1 兼容验证（Playwright）

- 新格式评估（r4）：text/name 从 `/api/prompts/questions` 按 key 取，题面/方向名正常显示；scoringApplied/summary/strengths/weaknesses 区块不显示；0 console error
- 旧格式评估（阶段二前）：text/name 从 aiDetail 取，题面/方向名正常；scoringApplied 区块保留显示；0 console error
- 两条路径都正常，`question.text ?? lookup?.textMap.get(...) ?? ''` 兼容逻辑落地

### 待评估风险

`PARSING_CONCURRENCY=5` 违反 CLAUDE.md「SQLite 不支持并发写，不要调高」警告。r1/r3/r4 未崩（busy_timeout 兜底），但解析重本地 IO + 写 Resume 表，5 并发写 SQLite 长期有锁竞争风险，建议单独评估降回 1-2。

## 九、附录：screening 输入 token 构成

screening 输入 = system prompt（固定）+ user prompt（简历文本）。基于 sample 岗位量化各部分字符占比（r5/r6 实测单份输入 4,585 token ≈ 10,008 字符，约 2.18 字符/token）：

### system prompt 各部分（固定 8,752 字符，同岗位不变）

| 部分 | 字符 | 占 system |
|------|------|----------|
| 输出格式（JSON 模板） | 4,797 | 54.8% |
| 技能维度段落（评分规则+方向+题面） | 1,498 | 17.1% |
| 知识维度段落（评分规则+方向+题面） | 1,446 | 16.5% |
| bodyText（职位说明前+后段） | 827 | 9.4% |
| 通用评分规则 | 124 | 1.4% |
| 结构符（---/标题） | 60 | 0.7% |

### 完整输入占比（system + 平均简历 1,256 字符 = 10,008 字符）

| 部分 | 占比 |
|------|------|
| JSON 输出模板 | 47.9% |
| 技能维度段落 | 15.0% |
| 知识维度段落 | 14.4% |
| 简历文本（userPrompt） | 12.6% |
| bodyText 职位说明 | 8.3% |
| 通用评分规则 | 1.2% |
| 结构符 | 0.6% |

### 关键发现

1. **输入 token 最大头是 JSON 输出模板（47.9%），不是简历文本（12.6%）**。JSON 模板把全部题目逐题展开（题数由职位 PromptRecord 配置决定，当前岗位为知识 15 + 技能 16，可增减），每题的 key/answer/evidence 字段名 + 占位符。
2. **简历文本占比低（12.6%）**因这批管培生简历短（平均 1,256 字符），其他岗位简历更长则占比升高。
3. **system prompt 命中缓存 98.5%**，实际计费的未命中输入很少；简历文本是唯一变量的未命中部分（~1,256 字符）。
4. **输入瘦身 ROI 低**：JSON 模板虽占 47.9%，但 system 命中缓存，压缩它省的是缓存价（1/10）且伤可读性，不建议。

## 十、阶段三容量测试

### 目的

找 PARSING/SCREENING 并发配置上限，为生产调优提供依据。

### 方法

- **筛选容量**：sample 岗位 100 份 SCREENED 简历，直接 `batch-screen`，SCREENING 15/20/30 三档
- **全管道**：附件存在的 63 份（SCREENED 57 + PENDING 6），`batch-parse(autoExtract)` + `batch-screen`，PARSING 8/10/15 三档
- 检测：ERROR 明细、锁类错误（SQLITE/lock/busy）、限速类（429/rate）

### 结果

**筛选容量（100 份 SCREENED）：**

| SCREENING | 耗时 | 成功率 | 锁 | 429 |
|-----------|------|--------|----|-----|
| 15 | 57.5s | 99% | 0 | 0 |
| 20 | 45.5s | 99% | 0 | 0 |
| 30 | 33.7s | 100% | 0 | 0 |

**全管道（63 份附件存在）：**

| PARSING | 解析 | 筛选 | 总耗时 | 成功率 | 锁 |
|---------|------|------|--------|--------|----|
| 8 | 90.5s | 24.4s | 114.9s | 100% | 0 |
| 10 | 69.4s | 24.2s | 93.6s | 100% | 0 |
| 15 | 81.5s | 21.4s | 102.9s | 100% | 0 |

### 结论

1. **SCREENING=30 并发（~180 RPM）未触 DeepSeek 限速**；上限未测出（100 份样本 RPM 有限，30 并发已远超生产需要）
2. **PARSING=15 并发写 SQLite 无锁**：解析 DB 写稀疏（每份解析完成后写一次 Resume 表），15 个 worker 的写被 AI 提取的 API 耗时隔开，busy_timeout 兜底，锁风险低。阶段二遗留的 PARSING 风险排除
3. **~1% AI 偶发畸形 JSON**（`finishReason=stop` 但 JSON 解析失败，输出 token 正常）：与并发无关（15/20 并发各 1 份、30 和全管道 0 份），个别简历需重试，是发现 4 的另一变体
4. **附件样本限制**：961 份 parseMethod=text 中仅 73 份附件存在（data/uploads 清理过），全管道测试上限 63 份

### 最终配置

| 变量 | 验证安全值 | 最终采用 | 理由 |
|------|-----------|---------|------|
| SCREENING | 30 | **30** | ~180 RPM 验证稳定，100 份 33.7s |
| PARSING | 15 | **10** | 15 验证安全，10 已满足生产需要留余量 |

### 遗留

- ~1% AI 畸形 JSON：可考虑重试或 JSON 容错（输出瘦身后仍是偶发问题，与容量无关）
- 限速/锁真实上限需更大样本验证（当前样本 RPM 有限），但对生产（一次批量 100-200 份）裕量充足

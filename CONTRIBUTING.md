# 贡献指南

感谢你愿意为 **ResumeGlacier** 贡献代码、文档或想法！本指南会帮助你快速上手。

---

## 行为准则

- **友善**：尊重不同背景的贡献者，保持专业态度
- **聚焦**：讨论对项目有价值的内容，避免无关话题
- **开放**：欢迎新人提问，"我也很菜" 是有效的回答

---

## 如何贡献

### 报告 Bug

在 [Issues](https://github.com/learnLJS/resume-glacier/issues) 提交 Bug 时请包含：

- **复现步骤**（越详细越好）
- **期望行为** vs **实际行为**
- **环境信息**：操作系统、Node 版本（`npx tsc --version`）、浏览器
- **相关日志**：构建/运行时终端输出
- **截图 / 录屏**（如果是 UI 问题）

### 提出新功能

在 [Discussions](https://github.com/learnLJS/resume-glacier/discussions) 的 Ideas 分类发起讨论，说明：

- **使用场景**：谁会用、用来解决什么问题
- **替代方案**：当前用户是怎么做的
- **建议实现**：可选，说明你倾向的实现思路

达成共识后再开 PR。

### 提交代码

#### 1. Fork & Clone

```bash
# 先在 GitHub 上 Fork 本仓库（learnLJS/resume-glacier），再克隆你自己的 fork
# 把 <your-username> 换成你的 GitHub 账号
git clone https://github.com/<your-username>/resume-glacier.git
cd resume-glacier
```

#### 2. 创建特性分支

```bash
git checkout -b feat/your-feature
# 或 fix/your-bugfix
# 或 docs/your-doc-update
```

#### 3. 本地开发

```bash
npm install         # 安装依赖
npm run db:setup    # 首次：初始化数据库
npm run dev         # 启动开发服务
```

修改代码后通过浏览器（[http://localhost:3000](http://localhost:3000)）验证。
本项目无自动化单元测试，端到端验证通过 Playwright MCP 进行。

#### 4. 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新增 XXX 功能
fix: 修复 XXX 问题
refactor: 重构 XXX 模块
docs: 更新 XXX 文档
style: 调整 XXX 格式
perf: 优化 XXX 性能
test: 增加 XXX 测试
chore: 杂项维护
```

示例：

```
feat: 支持 LDAP 用户认证
fix: 修复 Webhook 推送时区错误
refactor: 重构硬条件筛选逻辑
docs: 补充环境变量说明
```

#### 5. 推送 & 提 PR

```bash
git push origin feat/your-feature
```

在 GitHub 上创建 Pull Request，**描述清楚**：

- 这个 PR 解决了什么问题
- 主要改动点（文件级别）
- 是否影响向后兼容
- 验证方式（Playwright MCP 截图 / 录屏）

---

## 编码规范

### 命名

| 类别 | 规范 | 示例 |
|------|------|------|
| 服务文件 | `lib/services/` 下 kebab-case | `ai-screener.ts`、`tag-detector.ts` |
| React 组件 | PascalCase | `FollowUpTable.tsx`、`ScoreCards.tsx` |
| API 路由 | RESTful 风格 | `app/api/resumes/`、`app/api/evaluations/` |
| 路径别名 | `@/*` 映射项目根目录 | `import { cn } from '@/lib/utils'` |

### 语言

- UI 文本、commit message、代码注释使用**中文**
- 技术术语（API、SDK、Webhook 等）保留英文

### 样式

- 使用 `cn()`（`lib/utils.ts`）合并 className
- UI 基础组件遵循 shadcn/ui 模式（`components/ui/`）
- 设计令牌统一在 `app/globals.css` 的 `:root` 中定义

### 确定性逻辑 vs AI

**确定性逻辑必须写成显式代码**（条件语句、配置值、查找表），AI 只负责分类、摘要、草稿、歧义消解：

- ✅ 硬条件筛选（学历、经验年限）：`lib/services/hard-condition-filter.ts`
- ✅ 规则打标（985/211、大厂背景）：`lib/services/tag-detector.ts`
- ✅ 重试策略、路由逻辑、阈值判断：显式代码
- ❌ 不要让 AI 决定"这个简历是否合格"
- ❌ 不要让 AI 决定"重试几次后放弃"

### 数据库

- **无迁移**：直接用 `prisma db push`，schema 变更后 `prisma generate`
- **SQLite 限制**：解析队列并发=1、PM2 fork 单实例
- **改字段**：SQLite 无 ALTER COLUMN，需重建表

---

## 设计令牌

设计令牌统一在 `app/globals.css` 的 `:root` 中定义。**石墨主题**配色（极简 · 高级）：

| 令牌 | HSL | 对应色 |
|------|-----|--------|
| `--primary` | 220 18% 22% | 石墨近黑（主按钮/选中） |
| `--accent` | 250 55% 48% | 蓝紫（品牌点缀） |
| `--destructive` | 0 75% 55% | 标准红（错误） |
| `--success` | 150 65% 35% | 翠绿（成功） |
| `--warning` | 38 85% 52% | 琥珀（待定/警告） |
| `--info` | 210 80% 50% | 蓝（信息/进行中） |
| `--sidebar` | 220 12% 12% | 深石墨侧边栏 |

新增颜色请先确认是否能用现有令牌复用，避免引入新色值。完整令牌清单与 UI 迭代计划见 `ui重新设计.md`（重构批次 B12 执行子文档）。

---

## 项目结构

```
hr/
├── app/                      # Next.js App Router
│   ├── api/                  # API 路由
│   ├── resume/               # 控制台页面
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 着陆页
├── components/               # React 组件
│   ├── ui/                   # 基础组件（shadcn/ui 模式）
│   └── resume/               # 业务组件
├── lib/
│   ├── services/             # 核心服务
│   ├── prompts/              # 提示词模板
│   ├── constants/            # 常量
│   ├── hooks/                # 自定义 hooks
│   ├── polyfills/            # pdfjs-dist polyfill
│   ├── prisma.ts             # Prisma 客户端单例
│   └── utils.ts              # cn() 等工具
├── prisma/
│   ├── schema.prisma         # 数据模型
│   └── data/                 # SQLite 数据库（运行时生成）
├── scripts/                  # 辅助脚本
├── types/                    # TypeScript 类型
├── docs/                     # 项目文档（ARCHITECTURE、DEPLOY 等）
├── deploy/                   # 部署脚本与环境基准
├── data/                     # 运行时数据（uploads/、logs/）
└── package.json
```

---

## 测试

本项目**无自动化单元测试**，端到端验证通过 Playwright MCP 进行：

1. 启动开发服务：`npm run dev`
2. 调用 Playwright MCP 浏览器工具访问页面、截图、交互验证
3. 验证完成保存截图到 `.playwright-mcp/` 目录

如需添加自动化测试，请优先考虑 E2E 测试（Playwright），避免单元测试覆盖业务逻辑（业务逻辑大多依赖数据库和外部服务，单测价值低）。

---

## 发布流程（维护者）

1. 更新 `package.json` 版本号（遵循语义化版本）
2. 更新 README 中的功能清单
3. 创建 Git Tag：`git tag v0.x.0`
4. 推送 Tag：`git push origin v0.x.0`
5. GitHub Actions 自动构建并发布 npm 包（可选）

---

## 社区

- [GitHub Issues](https://github.com/learnLJS/resume-glacier/issues) — Bug 报告、功能请求
- [GitHub Discussions](https://github.com/learnLJS/resume-glacier/discussions) — 想法讨论、使用经验
- [GitHub Wiki](https://github.com/learnLJS/resume-glacier/wiki) — 社区维护的教程与最佳实践

---

## 许可证

提交代码即表示你同意以 [MIT 许可证](./LICENSE) 发布你的贡献。
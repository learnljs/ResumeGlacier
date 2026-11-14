# 邮箱配置 IMAP 测试与文件夹选择优化

## 改造目标

1. **测试连接**：仅测试 IMAP 协议是否通畅（connect + logout），不验证特定文件夹是否存在，同时提供更详细的错误信息以便排查问题。
2. **收取文件夹**：增加"获取文件夹列表"功能，通过 IMAP LIST 命令获取邮箱所有目录，让用户从下拉列表中选择，避免手动输入错误。

---

## 任务 1：优化 `testImapConnection` 函数

**文件**：`lib/services/email-fetcher.ts`

- 修复第 51 行多余的 `})` 语法问题
- 增加连接超时配置（`connectionTimeout: 15000`, `greetingTimeout: 10000`），防止测试连接时长时间挂起
- 增加更详细的错误分类（认证失败、连接超时、TLS 错误等），返回不同的提示信息
- 测试连接保持纯 IMAP 协议连通性验证（仅 connect + logout，不选择 mailbox）

## 任务 2：新增 `listImapFolders` 函数

**文件**：`lib/services/email-fetcher.ts`

- 新增导出函数 `listImapFolders(config)`：接受 IMAP 连接参数，连接后调用 `client.list()` 获取所有目录
- 返回 `{ success: boolean, folders?: Array<{path, name, delimiter, specialUse}>, message?: string }`
- 增加适当的超时和错误处理

## 任务 3：新增获取文件夹列表 API

**文件**：`app/api/config/email/folders/route.ts`（新建）

- POST 接口，接受 `{ host, port, secure, user, password }`
- 验证必填参数
- 调用 `listImapFolders`，返回文件夹列表

## 任务 4：改造前端邮箱配置页面

**文件**：`app/resume/system-config/email/page.tsx`

- 添加 `folderList` state（存储获取到的文件夹列表）和 `loadingFolders` state
- 在"收取文件夹"输入框位置，改为：
  - 一个 Select 下拉框（展示文件夹列表，支持选择）
  - 旁边增加"获取文件夹"按钮（带 loading 状态）
  - 当用户点击"获取文件夹"时，调用 `/api/config/email/folders` 获取列表
  - 支持手动输入的自定义选项（保留兼容性）
- 新建表单和编辑表单两处都需要同步修改

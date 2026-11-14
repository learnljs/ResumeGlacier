-- ============================================================================
-- 脚本名称: 001-add-contacted-field.sql
-- 关联 Spec: docs/dev/跟进管理模块/联系结果登记功能_task-39b.md
-- 变更描述: FollowUpRecord 表新增 contacted 字段（联系结果）
-- 变更日期: 2026-07-07
-- 状态: 已应用（2026-07-07）。该字段现已在 prisma/schema.prisma 中，
--       新环境无需执行本脚本，直接 `npm run db:setup`（prisma db push）即可；
--       本文件仅作为该次线上变更的留档。
-- 数据库: SQLite
-- 执行方式: sqlite3 prisma/data/resume.db < deploy/script/prod/001-add-contacted-field.sql
-- ============================================================================

-- 1. 添加 contacted 字段（默认值为 NOT_CONTACTED）
-- SQLite 使用 ALTER TABLE ADD COLUMN 语法，新字段必须指定默认值
ALTER TABLE FollowUpRecord ADD COLUMN contacted TEXT NOT NULL DEFAULT 'NOT_CONTACTED';

-- ============================================================================
-- 验证（执行后可选运行）
-- .schema FollowUpRecord          -- 查看表结构，确认字段已添加
-- SELECT id, contacted FROM FollowUpRecord LIMIT 5;  -- 查看数据默认值
-- SELECT contacted, COUNT(*) FROM FollowUpRecord GROUP BY contacted;  -- 统计数据分布
-- ============================================================================

#!/bin/sh
# 容器启动入口：先把数据库结构对齐，再拉起 Next standalone server。
#
# 为什么在启动时建表而不是构建时：SQLite 文件挂在数据卷里，
# 构建阶段还没有这个文件；换成 Postgres 时这条命令同样适用（幂等）。
set -e

: "${DATABASE_URL:=file:./data/resume.db}"
export DATABASE_URL

if [ -z "${ENCRYPTION_KEY}" ]; then
  echo "[entrypoint] 警告：ENCRYPTION_KEY 未设置，邮箱密码将无法加密存储。" >&2
  echo "[entrypoint] 生成方式：openssl rand -hex 32" >&2
fi

echo "[entrypoint] 同步数据库结构：$DATABASE_URL"
prisma db push --schema=/app/prisma/schema.prisma --skip-generate

echo "[entrypoint] 启动应用（PORT=${PORT:-3000}）"
exec "$@"

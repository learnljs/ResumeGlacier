# ResumeGlacier 生产镜像
#
# 三阶段：deps（装依赖）→ builder（prisma generate + next build）→ runner（standalone 运行）
# 运行期只需要 Node、prisma CLI 与 OCR 语言包，镜像里不含源码与构建缓存。

# ---------- 依赖层 ----------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# prisma 的查询引擎依赖 openssl，slim 镜像需要显式安装
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# 用 install 而非 ci：lock 在 Windows 上生成，Linux 下 npm ci 会因可选 peer 依赖
#（@emnapi/*，来自 @napi-rs/wasm-runtime）判定 lock 不同步并中止；详见 .github/workflows/ci.yml
RUN npm install --no-audit --no-fund

# ---------- 构建层 ----------
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期只需要一个合法的 DATABASE_URL，不会连接真实数据
ENV DATABASE_URL="file:./data/build.db"
# postinstall 负责把 pdf.worker.min.mjs 同步到 public/，构建前再跑一次保证存在
RUN npm run postinstall \
  && npx prisma generate \
  && npm run build

# ---------- 运行层 ----------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# standalone 产物：server.js + 被追踪到的依赖
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# OCR 语言包：lib/services/pdf-common.ts 从 process.cwd() 读取，standalone 不会自动带上
COPY --from=builder /app/chi_sim.traineddata /app/eng.traineddata ./
# tesseract.js 的 wasm 引擎同样按 process.cwd()/node_modules/tesseract.js-core 定位
COPY --from=builder /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core

# 启动时用 prisma CLI 建表（standalone 不带 CLI，单独全局装一份，避免覆盖应用依赖）
RUN npm install -g prisma@5.22.0 --no-audit --no-fund
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /app/prisma/data /app/data/uploads

# 数据库与附件放在数据卷里，容器重建不丢
VOLUME ["/app/prisma/data", "/app/data/uploads"]

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]

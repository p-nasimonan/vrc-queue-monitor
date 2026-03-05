FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate

WORKDIR /app

# Dependencies
# モノレポルートをcontextにするため、ルートのpnpm-lock.yamlを参照できる
FROM base AS deps
COPY apps/frontend/package.json ./package.json
COPY pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/frontend/ .

# Generate Panda CSS
RUN pnpm prepare

# Build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# publicディレクトリが存在しない場合に備えて先に作成
RUN mkdir -p ./public
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

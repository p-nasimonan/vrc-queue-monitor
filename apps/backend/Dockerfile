# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@10.30.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile --filter vrc-queue-monitor-backend

# ---- Production ----
FROM node:22-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -S appuser

# Copy pnpm virtual store + package node_modules
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appgroup /app/apps/backend/node_modules ./apps/backend/node_modules

# Source code
COPY --chown=appuser:appgroup apps/backend/src ./apps/backend/src

USER appuser
WORKDIR /app/apps/backend

# tsx is symlinked from the pnpm virtual store into node_modules/.bin/tsx
CMD ["node_modules/.bin/tsx", "src/main.ts"]

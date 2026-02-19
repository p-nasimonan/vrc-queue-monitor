# ============================================
# Backend Dockerfile - Multi-stage Build
# ============================================

# ---- Base ----
FROM python:3.11-slim AS base
WORKDIR /app

# ---- Dependencies (for cache) ----
FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Development ----
FROM deps AS development
COPY src/ ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "main.py"]

# ---- Production Builder ----
FROM base AS builder
COPY requirements.txt .
# プロダクション用: 別ディレクトリにインストール
RUN pip install --no-cache-dir --target=/install -r requirements.txt

# ---- Production ----
FROM python:3.11-alpine AS production

# セキュリティ: 非rootユーザー
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# 依存関係をコピー
COPY --from=builder /install /usr/local/lib/python3.11/site-packages/

# psycopg2-binary用のlibpq (alpine)
RUN apk add --no-cache libpq

# ソースコード
COPY --chown=appuser:appgroup src/ ./

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# デフォルトはコレクター。k8sのcommandで上書き可能
CMD ["python", "main.py"]

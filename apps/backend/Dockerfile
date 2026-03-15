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
# ソースは docker-compose の volume mount で渡すため COPY しない
FROM deps AS development
ENV PYTHONUNBUFFERED=1
CMD ["python", "main.py"]

# ---- Production ----
FROM python:3.11-slim AS production

# セキュリティ: 非rootユーザー
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -m appuser

WORKDIR /app

# 依存関係とtzdata（タイムゾーン対応）をインストール
COPY requirements.txt .
USER root
RUN apt-get update && apt-get install -y tzdata && \
    pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
    
# ソースコード
COPY --chown=appuser:appgroup src/ ./

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# デフォルトはコレクター。k8sのcommandで上書き可能
CMD ["python", "main.py"]

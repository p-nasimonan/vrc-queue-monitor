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

# ---- Production ----
FROM python:3.11-slim AS production

# セキュリティ: 非rootユーザー
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -m appuser

WORKDIR /app

# 依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache

# ソースコード
COPY --chown=appuser:appgroup src/ ./

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# デフォルトはコレクター。k8sのcommandで上書き可能
CMD ["python", "main.py"]

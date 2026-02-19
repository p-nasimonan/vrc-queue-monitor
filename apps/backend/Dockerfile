FROM python:3.11-slim

WORKDIR /app

# 依存関係インストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ソースコード
COPY src/ ./

# 実行
CMD ["python", "main.py"]

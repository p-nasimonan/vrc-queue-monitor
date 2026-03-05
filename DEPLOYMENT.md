# VRC Queue Monitor - デプロイガイド

## 目次
- [前提条件](#前提条件)
- [1. ローカル開発環境](#1-ローカル開発環境)
- [2. Docker Compose デプロイ](#2-docker-compose-デプロイ)
- [3. Kubernetes + ArgoCD デプロイ](#3-kubernetes--argocd-デプロイ)
- [4. トラブルシューティング](#4-トラブルシューティング)

---

## 前提条件

- Docker & Docker Compose
- Node.js 22+ & pnpm 9+ (ローカル開発時)
- kubectl (Kubernetes デプロイ時)
- Helm 3+ (Kubernetes デプロイ時)
- kubeseal (SealedSecret 使用時)

---

## 1. ローカル開発環境

### フロントエンドのみ（モックAPI）

```bash
# 依存関係インストール
pnpm install

# モックAPIでフロントエンド起動
pnpm dev:mock
```

ブラウザで http://localhost:3000 を開く

### フロントエンド + バックエンドAPI

```bash
# PostgreSQL と API を起動
pnpm db:up
pnpm api:up

# フロントエンド起動（実APIに接続）
pnpm dev
```

### フルスタック（コレクター含む）

```bash
# .env ファイルを作成
cp .env.example .env
# VRC認証情報を設定

# 全サービス起動
docker compose up -d
```

---

## 2. Docker Compose デプロイ

### 開発環境

```bash
# 開発モード（ホットリロード有効）
docker compose up -d
```

### 本番環境

```bash
# .env ファイルに本番設定を記載
cat <<EOF > .env
DB_PASSWORD=your-secure-password
VRC_USERNAME=your-email@example.com
VRC_PASSWORD=your-password
TOTP_SECRET=YOURBASE32SECRET
VRC_GROUP_ID=grp_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SCHEDULE_TYPE=time
SCHEDULE_START_TIME=21:00
SCHEDULE_END_TIME=02:00
POLL_INTERVAL_MINUTES=5
EOF

# 本番用 Docker Compose で起動
docker compose -f docker-compose.prod.yml up -d
```

**イメージビルド:**
```bash
# マルチアーキテクチャビルド（AMD64, ARM64）
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-org/vrc-queue-monitor/backend:latest \
  --target production \
  ./apps/backend

docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-org/vrc-queue-monitor/frontend:latest \
  --target runner \
  -f apps/frontend/Dockerfile .
```

---

## 3. Kubernetes + ArgoCD デプロイ

### 3.1 SealedSecret の作成

```bash
# 1. Secret YAMLを作成（値は実際のものに置き換え）
cat <<EOF > secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vrc-queue-monitor-secrets
  namespace: vrc-queue-monitor
stringData:
  DB_PASSWORD: "your-password"
  VRC_USERNAME: "your-email@example.com"
  VRC_PASSWORD: "your-password"
  VRC_TOTP_SECRET: "YOURBASE32SECRET"
  VRC_GROUP_ID: "grp_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
EOF

# 2. kubeseal で暗号化
kubeseal --format yaml < secret.yaml > sealedsecret.yaml

# 3. 暗号化された値を抽出
yq '.spec.encryptedData' sealedsecret.yaml

# 4. charts/vrc-queue-monitor/values.yaml に設定
```

**values.yaml の設定例:**
```yaml
secrets:
  sealedSecret:
    enabled: true
    encryptedData:
      dbPassword: "AgA..."
      vrcUsername: "AgB..."
      vrcPassword: "AgC..."
      vrcTotpSecret: "AgD..."
      vrcGroupId: "AgE..."
```

### 3.2 Helm インストール

```bash
# Namespace 作成
kubectl create namespace vrc-queue-monitor

# SealedSecret Controller インストール（未インストールの場合）
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.5/controller.yaml

# Helm チャートインストール
helm install vrc-queue-monitor ./charts/vrc-queue-monitor \
  -n vrc-queue-monitor \
  -f values-production.yaml
```

### 3.3 ArgoCD デプロイ

#### Option 1: ArgoCD UI から

1. ArgoCD UI にログイン
2. 「+ NEW APP」をクリック
3. 以下の情報を入力:
   - Application Name: `vrc-queue-monitor`
   - Project: `default`
   - Repository URL: `https://github.com/p-nasimonan/vrc-queue-monitor.git`
   - Path: `charts/vrc-queue-monitor`
   - Cluster: `in-cluster`
   - Namespace: `vrc-queue-monitor`
4. 「CREATE」をクリック
5. 「SYNC」をクリック

#### Option 2: kubectl apply

```bash
# ArgoCD Application マニフェストを適用
kubectl apply -f argocd/application.yaml
```

#### Option 3: home-manifests リポジトリに追加（推奨）

```bash
# home-manifests リポジトリに Application マニフェストをコピー
cp argocd/application.yaml ~/Documents/GitHub/home-manifests/apps/vrc-queue-monitor.yaml

# SealedSecret も一緒にコミット
cp sealedsecret.yaml ~/Documents/GitHub/home-manifests/apps/vrc-queue-monitor-secret.yaml

cd ~/Documents/GitHub/home-manifests
git add apps/vrc-queue-monitor*.yaml
git commit -m "Add VRC Queue Monitor application"
git push
```

### 3.4 ArgoCD Image Updater の設定

`argocd/application.yaml` に設定済み:

```yaml
annotations:
  argocd-image-updater.argoproj.io/image-list: |
    backend=ghcr.io/p-nasimonan/vrc-queue-monitor/backend,
    frontend=ghcr.io/p-nasimonan/vrc-queue-monitor/frontend
  argocd-image-updater.argoproj.io/backend.update-strategy: latest
  argocd-image-updater.argoproj.io/frontend.update-strategy: latest
```

**動作:**
- GitHub Actions でイメージビルド → `latest` タグでプッシュ
- ArgoCD Image Updater が検知 → values を自動更新
- ArgoCD が変更を検知 → 自動デプロイ

---

## 4. トラブルシューティング

### 問題: Backend が CrashLoopBackOff (ModuleNotFoundError)

**原因:** Dockerfile のマルチステージビルドで glibc/musl の不一致

**解決:**
```bash
# Dockerfile を確認（production ステージも slim ベースであること）
FROM python:3.11-slim AS production

# イメージを再ビルド
docker buildx build --platform linux/amd64,linux/arm64 \
  --target production \
  -t ghcr.io/p-nasimonan/vrc-queue-monitor/backend:latest \
  ./apps/backend --push
```

### 問題: ImagePullBackOff (タグが見つからない)

**原因:** ArgoCD Image Updater が存在しないタグをセット

**解決:**
```bash
# 現在のイメージタグを確認
kubectl get deployment -n vrc-queue-monitor -o yaml | grep image:

# GitHub Container Registry でタグを確認
gh api /user/packages/container/vrc-queue-monitor%2Fbackend/versions

# 存在するタグに手動で変更
kubectl set image deployment/vrc-queue-monitor-backend-api \
  backend-api=ghcr.io/p-nasimonan/vrc-queue-monitor/backend:latest \
  -n vrc-queue-monitor
```

### 問題: PostgreSQL が起動しない (subPath エラー)

**原因:** PVC に直接マウントすると init に失敗する場合がある

**解決:** `charts/vrc-queue-monitor/templates/postgres.yaml` で `subPath: pgdata` を使用（設定済み）

### 問題: VRChat API ログインに失敗

**チェック項目:**
1. `VRC_USERNAME` はメールアドレスか？（表示名ではない）
2. `VRC_TOTP_SECRET` はスペースを含んでいないか？
3. Base32 形式か？（16進数ではない）

```bash
# Secret を確認
kubectl get secret vrc-queue-monitor-secrets -n vrc-queue-monitor -o yaml

# Base64 デコードして確認
kubectl get secret vrc-queue-monitor-secrets -n vrc-queue-monitor \
  -o jsonpath='{.data.VRC_USERNAME}' | base64 -d
```

### 問題: Ingress が動作しない

**チェック項目:**
1. Ingress Controller はインストール済みか？
2. `values.yaml` で `ingress.enabled: true` か？
3. Service 名が正しいか？（`backend-api` not `backendApi`）

```bash
# Ingress を確認
kubectl get ingress -n vrc-queue-monitor

# Service を確認
kubectl get svc -n vrc-queue-monitor
```

---

## 補足: GitHub Actions ワークフロー

### タグベースのセマンティックバージョニング

```bash
# バージョンタグをプッシュ
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions が自動でビルド＆プッシュ
# - ghcr.io/p-nasimonan/vrc-queue-monitor/backend:1.0.0
# - ghcr.io/p-nasimonan/vrc-queue-monitor/backend:1.0
# - ghcr.io/p-nasimonan/vrc-queue-monitor/backend:1
# - ghcr.io/p-nasimonan/vrc-queue-monitor/backend:latest
```

### 手動ビルドトリガー

GitHub UI から:
1. Actions タブを開く
2. 「Build & Push Docker Images」を選択
3. 「Run workflow」をクリック

---

## 参考リンク

- [Helm Chart README](charts/vrc-queue-monitor/README.md)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)

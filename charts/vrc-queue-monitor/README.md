# VRC Queue Monitor — Helm Chart

このディレクトリには、VRC Queue Monitor を Kubernetes クラスターにデプロイするための Helm Chart が含まれています。

## Helm リポジトリの追加

Chart は GitHub Pages で公開されています。

```bash
helm repo add vrc-queue-monitor https://p-nasimonan.github.io/vrc-queue-monitor/
helm repo update
```

## インストール

### 最小構成（必須の Secret を設定）

```bash
helm install vrc-monitor vrc-queue-monitor/vrc-queue-monitor \
  --set secrets.dbPassword="YourStrongPassword" \
  --set secrets.vrcUsername="your@email.com" \
  --set secrets.vrcPassword="YourVRCPassword" \
  --set secrets.vrcTotpSecret="YOURTOTP" \
  --set secrets.vrcGroupId="grp_xxxxxx"
```

### カスタム values.yaml を使ったインストール

```bash
# values をコピーして編集
helm show values vrc-queue-monitor/vrc-queue-monitor > my-values.yaml
# 編集後…
helm install vrc-monitor vrc-queue-monitor/vrc-queue-monitor -f my-values.yaml
```

### フロントエンドの設定変更（ConfigMap）

`values.yaml` の `frontend.config` セクションで環境変数を設定できます:

```yaml
frontend:
  config:
    NEXT_PUBLIC_SITE_NAME: "私のVRC Monitor"
    NEXT_PUBLIC_REFRESH_INTERVAL: "30000"  # 30秒ごとに更新
    NEXT_PUBLIC_DISPLAY_DAYS: "14"         # 過去14日分を表示
    NEXT_PUBLIC_USE_MOCK_API: "false"
```

### Ingress を有効化する

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: vrc-monitor.example.com
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backendApi
  tls:
    - secretName: vrc-monitor-tls
      hosts:
        - vrc-monitor.example.com
```

### イメージタグの固定

```yaml
image:
  tag: "sha-abc1234"  # 特定のSHAに固定
```

## イメージ

| コンポーネント | イメージ |
|---|---|
| frontend | `ghcr.io/p-nasimonan/vrc-queue-monitor/frontend` |
| backend (API + Collector) | `ghcr.io/p-nasimonan/vrc-queue-monitor/backend` |

CI/CD で `main` ブランチへのプッシュ時に自動ビルド・プッシュされます。

## アーキテクチャ

```
[Ingress]
    ├─ /     → frontend (Next.js) :3000
    └─ /api  → backend-api (FastAPI) :8000
                    │
                    └─ postgres :5432
                         ↑
              backend-collector (スケジューラー) ─ VRChat API
```

## アップグレード

```bash
helm repo update
helm upgrade vrc-monitor vrc-queue-monitor/vrc-queue-monitor -f my-values.yaml
```

## アンインストール

```bash
helm uninstall vrc-monitor
# PVC は自動削除されません（データ保護）。手動で削除する場合：
kubectl delete pvc vrc-monitor-postgres-pvc
```

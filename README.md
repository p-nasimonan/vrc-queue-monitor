# VRC Queue Monitor

VRChatグループインスタンスの待機列をモニタリングするアプリケーション

## 🚀 クイックスタート

### モックモードでフロントエンドのみ開発（バックエンド不要）

```bash
# モックデータを使用してフロントエンドを起動
pnpm dev:mock
```

これでバックエンド、データベースなしでフロントエンドの開発ができます！

### 通常の開発（フルスタック）

```bash
# 1. データベースを起動
pnpm db:up

# 2. バックエンドAPIサーバーを起動（別ターミナル）
pnpm api:dev

# 3. フロントエンドを起動（別ターミナル）
pnpm dev
```

## 📁 プロジェクト構成

```
vrc-queue-monitor/
├── apps/
│   ├── backend/          # Python バックエンド
│   │   ├── src/
│   │   │   ├── main.py   # データ収集スクリプト
│   │   │   ├── api.py    # FastAPI サーバー
│   │   │   ├── db.py     # DB接続
│   │   │   └── vrc_api.py # VRChat API
│   │   └── requirements.txt
│   ├── frontend/         # Next.js フロントエンド
│   │   ├── src/
│   │   │   ├── app/      # Next.js App Router
│   │   │   ├── components/ # Reactコンポーネント
│   │   │   ├── lib/
│   │   │   │   ├── api/  # APIクライアント層
│   │   │   │   │   ├── index.ts    # エクスポート
│   │   │   │   │   ├── types.ts    # 型定義
│   │   │   │   │   ├── client.ts   # 本番用クライアント
│   │   │   │   │   └── mock.ts     # モック用クライアント
│   │   │   │   └── config.ts
│   │   │   └── styles/   # デザインシステム
│   │   └── panda.config.ts
│   └── db/
│       └── init.sql
└── docker-compose.yml
```

## 🎨 開発モード

### モックAPIモード

環境変数 `NEXT_PUBLIC_USE_MOCK_API=true` を設定すると、フロントエンドはモックデータを使用します。

**メリット:**
- バックエンド不要
- データベース不要
- UI/UXの開発に集中できる
- レスポンスが高速

### 本番APIモード

環境変数 `NEXT_PUBLIC_USE_MOCK_API=false` (デフォルト) で、FastAPIバックエンドに接続します。

## 🔧 技術スタック

### フロントエンド
- **Next.js 15** - Reactフレームワーク
- **Panda CSS** - CSS-in-JSスタイリング
- **Recharts** - グラフライブラリ
- **TypeScript** - 型安全性

### バックエンド
- **FastAPI** - REST APIサーバー
- **Python 3.11+** - データ収集スクリプト
- **PostgreSQL** - データベース
- **VRChatAPI** - VRChatデータ取得

## 📝 環境変数

### フロントエンド (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_API=true  # モックモードON/OFF
NEXT_PUBLIC_SITE_NAME="VRC Queue Monitor"
NEXT_PUBLIC_REFRESH_INTERVAL=60000
NEXT_PUBLIC_DISPLAY_DAYS=30
```

### バックエンド (.env)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vrc_monitor
DB_USER=postgres
DB_PASSWORD=postgres

# VRChat API
VRCHAT_USERNAME=your_username
VRCHAT_PASSWORD=your_password
VRCHAT_TOTP_SECRET=your_totp_secret
VRCHAT_GROUP_ID=grp_xxxxx

# API Server
API_PORT=8000
CORS_ORIGINS=http://localhost:3000
ENV=development
```

## 🧪 開発ワークフロー

### 1. UIデザインの作業（モックモード）

```bash
pnpm dev:mock
```

- モックデータで即座にUIを確認
- コンポーネントのスタイリング
- レイアウトの調整

### 2. API統合テスト（本番モード）

```bash
# ターミナル1: DB起動
pnpm db:up

# ターミナル2: APIサーバー起動
pnpm api:dev

# ターミナル3: フロントエンド起動（本番モード）
pnpm dev
```

### 3. 本番デプロイ

```bash
docker compose up -d
```

## 📦 NPMスクリプト

- `pnpm dev` - フロントエンド開発サーバー（本番API接続）
- `pnpm dev:mock` - フロントエンド開発サーバー（モックAPI）
- `pnpm db:up` - PostgreSQL起動
- `pnpm db:down` - PostgreSQL停止
- `pnpm api:dev` - FastAPIサーバー起動（開発モード）
- `pnpm api:up` - FastAPIサーバー起動（Docker）
- `pnpm backend:up` - データ収集バックエンド起動
- `pnpm all:up` - 全サービス起動

## 🎯 API エンドポイント

### FastAPI バックエンド (http://localhost:8000)

- `GET /` - ヘルスチェック
- `GET /api/instances` - インスタンス一覧
- `GET /api/instances/{id}` - 特定インスタンス
- `GET /api/event-groups` - イベントグループ一覧
- `GET /api/metrics` - メトリクス一覧

APIドキュメント: http://localhost:8000/docs

## 🎨 デザインシステム

Panda CSSを使用した統一されたデザインシステム:

- **レシピ** (`src/styles/recipes.ts`) - 再利用可能なスタイルパターン
- **ユーティリティ** (`src/styles/utils.ts`) - ヘルパー関数
- **トークン** (`panda.config.ts`) - カラー、spacing、フォントなど

## 📄 ライセンス

MIT

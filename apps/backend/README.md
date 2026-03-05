# VRC Queue Monitor - Backend

Python製のバックエンドサービス。VRChat APIからデータを収集し、FastAPIでREST APIを提供します。

## 構成

- **Collector** (`main.py`): VRChat APIから定期的にデータ収集
- **API Server** (`api.py`): FastAPIでデータ提供

## 環境変数

### 必須

```bash
VRC_USERNAME=your-email@example.com  # VRChatログイン用メールアドレス
VRC_PASSWORD=your-password           # VRChatパスワード
VRC_GROUP_ID=grp_xxx                # 監視対象のグループID
DB_HOST=localhost                    # PostgreSQLホスト
DB_PORT=5432                         # PostgreSQLポート
DB_NAME=vrc_monitor                  # データベース名
DB_USER=postgres                     # データベースユーザー
DB_PASSWORD=postgres                 # データベースパスワード
```

### オプション（2FA）

```bash
TOTP_SECRET=YOURBASE32SECRET         # 2FA有効時に必要（Base32形式、スペースなし）
```

### スケジュール設定

```bash
SCHEDULE_TYPE=always                 # always | time | weekday | day_of_month
SCHEDULE_DAYS=                       # weekdayなら "0,1,2" | day_of_monthなら "1,15"
SCHEDULE_START_TIME=21:00            # 開始時刻（HH:MM）
SCHEDULE_END_TIME=02:00              # 終了時刻（HH:MM）
POLL_INTERVAL_MINUTES=5              # メトリクス収集間隔（分）- 通常時
DISCOVERY_INTERVAL_MINUTES=10        # インスタンス発見間隔（分）- 低頻度
BURST_DURATION_MINUTES=5             # バースト期間（イベント開始から何分間）
BURST_INTERVAL_SECONDS=30            # バースト期間中の収集間隔（秒）
```

### API設定

```bash
API_PORT=8000                        # APIサーバーポート
CORS_ORIGINS=http://localhost:3000   # CORS許可オリジン（カンマ区切り）
ENV=production                       # 環境（production | development）
LOG_LEVEL=INFO                       # ログレベル（DEBUG | INFO | WARNING | ERROR | CRITICAL）
```

## 動作原理

### 二段階ポーリング戦略

VRChat APIの負荷を減らすため、データ収集を2つのフェーズに分けています：

#### 1. インスタンス発見（低頻度）
- **頻度**: デフォルト10分ごと（`DISCOVERY_INTERVAL_MINUTES`）
- **API**: `GET /groups/{groupId}/instances` - グループのインスタンス一覧を取得
- **処理**: 新しいインスタンスをDBに登録、既存インスタンスを更新
- **データ**: `location`, `name`, `world_name`, `capacity`, `world_thumbnail_url`, `world_image_url`, `instance_type`, `region`

#### 2. メトリクス収集（適応的頻度）
- **頻度**:
  - **バースト期間**（イベント開始直後5分間）: 30秒ごと（`BURST_INTERVAL_SECONDS`）
  - **通常期間**: デフォルト2分ごと（`POLL_INTERVAL_MINUTES`）
- **API**: `GET /instances/{worldId}:{instanceId}` - 各インスタンスの詳細を取得
- **処理**: DBに保存されたアクティブなインスタンスのみ対象
- **データ**: `queueSize`, `queueEnabled`, `n_users`（現在のキュー情報）

#### バースト期間
イベント開始直後は参加者が急増するため、高頻度で収集してデータの精度を上げます：

- **開始検知**: スケジュール期間が始まった瞬間（例: 22:00）
- **期間**: デフォルト5分間（`BURST_DURATION_MINUTES`）
- **間隔**: デフォルト30秒（`BURST_INTERVAL_SECONDS`）
- **終了後**: 通常の収集間隔に戻る

```python
# 例: 22:00にイベント開始、4つのインスタンスがある場合
# 22:00-22:05 (バースト期間):
#   30秒ごとに collect_metrics() → 詳細API 4回
#   → 0秒: inst1, 2秒: inst2, 4秒: inst3, 6秒: inst4
#   → 10回収集（5分 ÷ 30秒）
# 22:05以降 (通常期間):
#   2分ごとに collect_metrics() → 詳細API 4回
```

#### メリット
- グループAPI呼び出しを削減（10分に1回）
- イベント開始直後の重要な時間帯を細かく記録
- 通常時はAPI呼び出しを抑えてレート制限回避
- ワールドサムネイルやリージョン情報も取得してUI表示を強化

### 認証フロー

1. **初回ログイン**
   - `VRC_USERNAME`（メールアドレス）と`VRC_PASSWORD`で認証
   - 2FA有効の場合は`TOTP_SECRET`からワンタイムコードを生成して認証
   - セッションを`_authenticated`フラグで管理

2. **認証維持**
   - `ensure_authenticated()`は`_authenticated`フラグをチェック
   - 認証済みなら追加のログイン試行なし（レート制限回避）

3. **認証切れ検知**
   - API呼び出し時に`UnauthorizedException`が発生したら再ログイン
   - 自動リトライで継続

### レート制限対策

VRChat APIはレート制限があり、短時間に多数のリクエストを送ると401エラーと`Retry-After`ヘッダーが返されます。

#### 実装されている対策

1. **リクエスト間隔**: デフォルト2秒（`request_interval=2.0`）
2. **順次処理**: インスタンス詳細取得は1つずつ、間隔を空けて実行
3. **認証キャッシュ**: 一度ログインしたらセッション維持（毎回チェックしない）
4. **ログイン間隔**: 最低5秒間隔でログイン試行
5. **Retry-After対応**: APIから返される待機時間を自動的に遵守
6. **起動時リトライ**: 初回ログイン失敗時は最大3回まで自動リトライ

```python
# 二段階ポーリングにより、グループAPI呼び出しを大幅に削減
# 旧方式: 2分ごとにグループAPI + 詳細API N回 → 多くのAPI呼び出し
# 新方式: 10分ごとにグループAPI、2分ごとに詳細API N回のみ → API呼び出し削減
```

#### レート制限に引っかかった場合

ログに以下のようなメッセージが表示されます：
```
[ERROR] vrc_api: Rate limited. Retry after 147 seconds
[WARNING] vrc_api: Rate limited. Waiting 147 seconds before retry...
```

この場合、自動的に指定秒数待機してからリトライします。

#### 起動直後のレート制限

コンテナを頻繁に再起動すると、前回のログイン試行から時間が経っていないためレート制限を受けることがあります。

**回避方法**:
- 本番環境では `restart: unless-stopped` を使用（自動再起動しない）
- テスト時は最低3分間隔を空けて再起動する
- ログに出力される `Retry-After` の秒数を待つ

## ローカル開発

### 必要なもの

- Python 3.11+
- PostgreSQL 15+

### セットアップ

```bash
# 依存関係インストール
cd apps/backend
pip install -r requirements.txt

# 環境変数設定
export VRC_USERNAME=your-email@example.com
export VRC_PASSWORD=your-password
export TOTP_SECRET=YOURBASE32SECRET
export VRC_GROUP_ID=grp_xxx
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=vrc_monitor
export DB_USER=postgres
export DB_PASSWORD=postgres

# Collector起動
python src/main.py

# 別ターミナルでAPI Server起動
python src/api.py
```

## Docker

```bash
# 開発用（ホットリロード）
docker build --target development -t vrc-backend:dev .

# 本番用（最適化）
docker build --target production -t vrc-backend:prod .
```

## トラブルシューティング

### 401 Unauthorized エラー

**原因1: ログイン情報が間違っている**
- `VRC_USERNAME`はメールアドレスか確認（表示名ではない）
- `VRC_PASSWORD`に特殊文字が含まれる場合はクォートで囲む

**原因2: 2FAが有効だが`TOTP_SECRET`未設定**
- VRChatで2FAを有効にしている場合は`TOTP_SECRET`必須
- Base32形式（16進数ではない）
- スペースを含まないこと

**原因3: レート制限**
- VRChat APIはレート制限がある
- `request_interval`を増やす（2秒 → 3秒など）
- ログに`Retry-After`が出ている場合は指定秒数待つ

### ModuleNotFoundError: No module named 'pydantic_core._pydantic_core'

**原因**: Dockerイメージのビルド時にアーキテクチャが不一致

**解決**:
```bash
# Dockerfile の production ステージが slim ベースか確認
FROM python:3.11-slim AS production

# イメージ再ビルド
docker build --no-cache -t vrc-backend:latest .
```

### データが収集されない

**チェック項目**:
1. ログイン成功しているか？ → `Logged in as: xxx`
2. インスタンスが見つかっているか？ → `Found X active instances`
3. スケジュール範囲内か？ → `SCHEDULE_TYPE`と現在時刻を確認

```bash
# ログ確認
docker logs vrc-monitor-collector

# デバッグ: スケジュールを無効化
docker run -e SCHEDULE_TYPE=always vrc-backend:latest
```

### PostgreSQL接続エラー

```bash
# 接続テスト
psql -h localhost -p 5432 -U postgres -d vrc_monitor

# Dockerの場合はサービス名で接続
# DB_HOST=postgres（docker-compose.yml のサービス名）
```

## API エンドポイント

### `GET /`
ヘルスチェック

### `GET /api/event-groups?days=30`
イベントグループ一覧取得（スケジュールに基づいてグルーピング）

### `GET /api/instances`
全インスタンス一覧取得

### `GET /api/metrics?instance_id=1&hours=24`
特定インスタンスのメトリクス取得

## ライセンス

MIT

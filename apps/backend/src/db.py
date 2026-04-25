"""Database操作クラス"""

import os
import logging
from typing import Optional
from datetime import datetime, timezone
import psycopg2
from psycopg2 import extensions
from psycopg2.extras import RealDictCursor

# TIMESTAMP WITHOUT TIME ZONE (OID 1114) をUTC-awareなdatetimeとして返す
def _cast_timestamp_utc(value, cursor):
    if value is None:
        return None
    dt = datetime.fromisoformat(value.replace(" ", "T"))
    return dt.replace(tzinfo=timezone.utc)

_TS_UTC = extensions.new_type((1114,), "TIMESTAMP_UTC", _cast_timestamp_utc)
extensions.register_type(_TS_UTC)

logger = logging.getLogger(__name__)


class Database:
    """PostgreSQL接続・操作クラス"""

    def __init__(self):
        self.conn: Optional[psycopg2.extensions.connection] = None

    def connect(self) -> bool:
        """データベースに接続"""
        try:
            self.conn = psycopg2.connect(
                host=os.environ.get("DB_HOST", "localhost"),
                port=int(os.environ.get("DB_PORT", 5432)),
                database=os.environ.get("DB_NAME", "vrc_monitor"),
                user=os.environ.get("DB_USER", "postgres"),
                password=os.environ.get("DB_PASSWORD", "postgres"),
            )
            self.conn.autocommit = False
            logger.info("Database connected")
            return True
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return False

    def ensure_connected(self) -> bool:
        """接続を確認し、必要なら再接続"""
        if self.conn is None or self.conn.closed:
            return self.connect()

        try:
            with self.conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True
        except Exception:
            return self.connect()

    def close(self):
        """接続を閉じる"""
        if self.conn and not self.conn.closed:
            self.conn.close()
            logger.info("Database connection closed")

    def _column_exists(self, cur, table: str, column: str) -> bool:
        """information_schema でカラム存在確認（テーブルロックなし）"""
        cur.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
            (table, column),
        )
        return cur.fetchone() is not None

    def _column_has_default(self, cur, table: str, column: str) -> bool:
        """カラムに DEFAULT が設定されているか確認"""
        cur.execute(
            "SELECT column_default FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
            (table, column),
        )
        row = cur.fetchone()
        return row is not None and row[0] is not None

    def run_migrations(self) -> bool:
        """スキーママイグレーションを実行（冪等・高速）

        information_schema でカラムの存在を事前確認することで、
        すでに適用済みの ALTER TABLE は実行しない。
        これにより DDL ロックが発生せず、起動が即座に完了する。
        """
        if not self.ensure_connected():
            return False

        # (テーブル名, カラム名, 追加する SQL)
        column_migrations: list[tuple[str, str, str]] = [
            ("instances", "world_thumbnail_url", "ALTER TABLE instances ADD COLUMN world_thumbnail_url TEXT"),
            ("instances", "world_image_url",     "ALTER TABLE instances ADD COLUMN world_image_url TEXT"),
            ("instances", "instance_type",        "ALTER TABLE instances ADD COLUMN instance_type TEXT"),
            ("instances", "region",               "ALTER TABLE instances ADD COLUMN region TEXT"),
            ("instances", "display_name",         "ALTER TABLE instances ADD COLUMN display_name TEXT"),
            ("metrics",   "pc_users",             "ALTER TABLE metrics ADD COLUMN pc_users SMALLINT NOT NULL DEFAULT 0"),
            # 生データ保存用カラム
            ("metrics",   "n_users",              "ALTER TABLE metrics ADD COLUMN n_users SMALLINT NOT NULL DEFAULT 0"),
            ("metrics",   "queue_enabled",        "ALTER TABLE metrics ADD COLUMN queue_enabled BOOLEAN NOT NULL DEFAULT FALSE"),
        ]

        try:
            with self.conn.cursor() as cur:
                cur.execute("SET LOCAL lock_timeout = '3s'")
                cur.execute("SET LOCAL statement_timeout = '10s'")

                applied = 0
                for table, column, sql in column_migrations:
                    if not self._column_exists(cur, table, column):
                        cur.execute(sql)
                        applied += 1

                # current_users に DEFAULT を付与（新規 INSERT で省略できるようにする）
                if not self._column_has_default(cur, "metrics", "current_users"):
                    cur.execute("ALTER TABLE metrics ALTER COLUMN current_users SET DEFAULT 0")
                    applied += 1

            self.conn.commit()
            if applied:
                logger.info(f"Migrations applied: {applied} changes")
            else:
                logger.info("Migrations: already up to date, skipped")
            return True
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            self.conn.rollback()
            return False

    def upsert_instance(
        self,
        location: str,
        name: str,
        world_name: str,
        capacity: int,
        world_thumbnail_url: Optional[str] = None,
        world_image_url: Optional[str] = None,
        instance_type: Optional[str] = None,
        region: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> Optional[int]:
        """
        インスタンスをUpsert（なければ追加、あれば更新）

        Returns:
            instance_id または None
        """
        if not self.ensure_connected():
            return None

        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO instances (
                        location, name, display_name, world_name, capacity,
                        world_thumbnail_url, world_image_url, instance_type, region
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (location) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_name = EXCLUDED.display_name,
                        world_name = EXCLUDED.world_name,
                        capacity = EXCLUDED.capacity,
                        world_thumbnail_url = EXCLUDED.world_thumbnail_url,
                        world_image_url = EXCLUDED.world_image_url,
                        instance_type = EXCLUDED.instance_type,
                        region = EXCLUDED.region,
                        is_active = TRUE
                    RETURNING id
                """, (location, name, display_name, world_name, capacity,
                      world_thumbnail_url, world_image_url, instance_type, region))

                result = cur.fetchone()
                self.conn.commit()

                if result:
                    return result[0]
                return None

        except Exception as e:
            logger.error(f"Error upserting instance: {e}")
            self.conn.rollback()
            return None

    def deactivate_missing_instances(self, active_locations: list[str]) -> int:
        """指定されたlocationリストに含まれないインスタンスを非アクティブにする"""
        if not self.ensure_connected():
            return 0

        try:
            with self.conn.cursor() as cur:
                if not active_locations:
                    cur.execute("UPDATE instances SET is_active = FALSE WHERE is_active = TRUE")
                else:
                    cur.execute("""
                        UPDATE instances
                        SET is_active = FALSE
                        WHERE is_active = TRUE AND location != ALL(%s)
                    """, (active_locations,))

                rowcount = cur.rowcount
                self.conn.commit()
                return rowcount
        except Exception as e:
            logger.error(f"Error deactivating instances: {e}")
            self.conn.rollback()
            return 0

    def insert_metric(
        self,
        instance_id: int,
        n_users: int,
        queue_size: int,
        queue_enabled: bool,
        pc_users: int = 0,
    ) -> bool:
        """VRChat API から取得した生値をそのまま記録する。
        派生値（current_users 等）は API 返却時に計算する。
        """
        if not self.ensure_connected():
            return False

        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO metrics (instance_id, n_users, queue_size, queue_enabled, pc_users)
                    VALUES (%s, %s, %s, %s, %s)
                """, (instance_id, n_users, queue_size, queue_enabled, pc_users))
                self.conn.commit()
                return True
        except Exception as e:
            logger.error(f"Error inserting metric: {e}")
            self.conn.rollback()
            return False

    def get_active_instances(self) -> list[dict]:
        """アクティブなインスタンス一覧を取得"""
        if not self.ensure_connected():
            return []

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, location, name, display_name, world_name, capacity,
                           world_thumbnail_url, world_image_url, instance_type, region,
                           created_at
                    FROM instances
                    WHERE is_active = TRUE
                    ORDER BY created_at DESC
                """)
                return [dict(row) for row in cur.fetchall()]

        except Exception as e:
            logger.error(f"Error getting active instances: {e}")
            return []

    def get_instance_metrics(self, instance_id: int, hours: int = 3) -> list[dict]:
        """特定インスタンスの直近メトリクスを取得（生値）"""
        if not self.ensure_connected():
            return []

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT timestamp, n_users, queue_size, queue_enabled, pc_users,
                           current_users AS legacy_current_users
                    FROM metrics
                    WHERE instance_id = %s
                      AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                """, (instance_id, hours))
                return [dict(row) for row in cur.fetchall()]

        except Exception as e:
            logger.error(f"Error getting instance metrics: {e}")
            return []

    # ------------------------------------------------------------------
    # API エンドポイント向けクエリ
    # ------------------------------------------------------------------

    _METRICS_COLS = """
        m.timestamp,
        m.instance_id,
        m.n_users,
        m.queue_size,
        m.queue_enabled,
        m.pc_users,
        COALESCE(m.current_users, 0) AS legacy_current_users,
        i.capacity,
        i.location,
        i.name        AS instance_name,
        i.display_name,
        i.world_name,
        i.world_thumbnail_url,
        i.world_image_url,
        i.instance_type,
        i.region,
        i.created_at,
        i.is_active
    """

    def get_metrics_with_instances(self, days: int) -> tuple[list[dict], dict[int, dict]]:
        """イベントグループ用：直近 N 日のメトリクス行と、全インスタンス辞書を返す。"""
        if not self.ensure_connected():
            return [], {}

        try:
            with self.conn.cursor() as cur:
                cur.execute(f"""
                    SELECT {self._METRICS_COLS}
                    FROM metrics m
                    JOIN instances i ON m.instance_id = i.id
                    WHERE m.timestamp > NOW() - MAKE_INTERVAL(days => %s::integer)
                    ORDER BY m.timestamp DESC
                """, (days,))
                cols = [d[0] for d in cur.description]
                metrics = [dict(zip(cols, row)) for row in cur.fetchall()]

                cur.execute("SELECT * FROM instances")
                cols = [d[0] for d in cur.description]
                instances = {row[0]: dict(zip(cols, row)) for row in cur.fetchall()}

            return metrics, instances

        except Exception as e:
            logger.error(f"Error fetching metrics with instances: {e}")
            return [], {}

    def get_metrics_list(self, instance_id: Optional[int], hours: int) -> list[dict]:
        """メトリクス一覧（instances の capacity 付き）を返す。"""
        if not self.ensure_connected():
            return []

        try:
            with self.conn.cursor() as cur:
                where = "m.timestamp > NOW() - MAKE_INTERVAL(hours => %s::integer)"
                params: tuple = (hours,)
                if instance_id is not None:
                    where += " AND m.instance_id = %s"
                    params = (hours, instance_id)

                cur.execute(f"""
                    SELECT {self._METRICS_COLS}
                    FROM metrics m
                    JOIN instances i ON m.instance_id = i.id
                    WHERE {where}
                    ORDER BY m.timestamp DESC
                """, params)
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]

        except Exception as e:
            logger.error(f"Error fetching metrics list: {e}")
            return []

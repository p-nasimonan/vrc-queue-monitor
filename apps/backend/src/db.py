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

    def run_migrations(self) -> bool:
        """スキーママイグレーションを実行（冪等）"""
        if not self.ensure_connected():
            return False

        migrations = [
            "ALTER TABLE instances ADD COLUMN IF NOT EXISTS world_thumbnail_url TEXT",
            "ALTER TABLE instances ADD COLUMN IF NOT EXISTS world_image_url TEXT",
            "ALTER TABLE instances ADD COLUMN IF NOT EXISTS instance_type TEXT",
            "ALTER TABLE instances ADD COLUMN IF NOT EXISTS region TEXT",
            "ALTER TABLE instances ADD COLUMN IF NOT EXISTS display_name TEXT",
            "ALTER TABLE metrics ADD COLUMN IF NOT EXISTS pc_users SMALLINT NOT NULL DEFAULT 0",
        ]

        try:
            with self.conn.cursor() as cur:
                # 起動時のDDLロック待ちで無限にハングしないように制限する
                cur.execute("SET LOCAL lock_timeout = '5s'")
                cur.execute("SET LOCAL statement_timeout = '30s'")
                for sql in migrations:
                    cur.execute(sql)
            self.conn.commit()
            logger.info("Migrations applied successfully")
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

    def insert_metric(self, instance_id: int, queue_size: int, current_users: int, pc_users: int = 0) -> bool:
        """メトリクスを記録"""
        if not self.ensure_connected():
            return False

        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO metrics (instance_id, queue_size, current_users, pc_users)
                    VALUES (%s, %s, %s, %s)
                """, (instance_id, queue_size, current_users, pc_users))

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
        """特定インスタンスの直近メトリクスを取得"""
        if not self.ensure_connected():
            return []

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT timestamp, queue_size, current_users, pc_users
                    FROM metrics
                    WHERE instance_id = %s
                      AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                """, (instance_id, hours))
                return [dict(row) for row in cur.fetchall()]

        except Exception as e:
            logger.error(f"Error getting instance metrics: {e}")
            return []

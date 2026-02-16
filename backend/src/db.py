"""Database操作クラス"""

import os
import logging
from typing import Optional
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

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

    def upsert_instance(self, location: str, name: str, world_name: str, capacity: int) -> Optional[int]:
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
                    INSERT INTO instances (location, name, world_name, capacity)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (location) DO UPDATE SET
                        name = EXCLUDED.name,
                        world_name = EXCLUDED.world_name,
                        capacity = EXCLUDED.capacity,
                        is_active = TRUE
                    RETURNING id
                """, (location, name, world_name, capacity))

                result = cur.fetchone()
                self.conn.commit()

                if result:
                    return result[0]
                return None

        except Exception as e:
            logger.error(f"Error upserting instance: {e}")
            self.conn.rollback()
            return None

    def insert_metric(self, instance_id: int, queue_size: int, current_users: int) -> bool:
        """メトリクスを記録"""
        if not self.ensure_connected():
            return False

        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO metrics (instance_id, queue_size, current_users)
                    VALUES (%s, %s, %s)
                """, (instance_id, queue_size, current_users))

                self.conn.commit()
                return True

        except Exception as e:
            logger.error(f"Error inserting metric: {e}")
            self.conn.rollback()
            return False

    def save_instance_metrics(self, instances: list[dict]) -> int:
        """
        インスタンスリストからメトリクスを一括保存

        Args:
            instances: VRChat APIから取得したインスタンス詳細のリスト

        Returns:
            保存成功した件数
        """
        saved_count = 0

        for instance in instances:
            location = instance.get("location") or instance.get("instanceId")
            if not location:
                continue

            # インスタンス情報を抽出
            name = instance.get("name", "Unknown")
            world_name = instance.get("world", {}).get("name", "Unknown")
            capacity = instance.get("capacity", 0)
            queue_size = instance.get("queueSize", 0)
            current_users = instance.get("n_users", 0) or instance.get("userCount", 0)

            # インスタンスをUpsert
            instance_id = self.upsert_instance(location, name, world_name, capacity)
            if instance_id is None:
                continue

            # メトリクスを記録
            if self.insert_metric(instance_id, queue_size, current_users):
                saved_count += 1
                logger.debug(f"Saved metrics for {name}: queue={queue_size}, users={current_users}")

        logger.info(f"Saved {saved_count}/{len(instances)} instance metrics")
        return saved_count

    def get_active_instances(self) -> list[dict]:
        """アクティブなインスタンス一覧を取得"""
        if not self.ensure_connected():
            return []

        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, location, name, world_name, capacity, created_at
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
                    SELECT timestamp, queue_size, current_users
                    FROM metrics
                    WHERE instance_id = %s
                      AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                """, (instance_id, hours))
                return [dict(row) for row in cur.fetchall()]

        except Exception as e:
            logger.error(f"Error getting instance metrics: {e}")
            return []

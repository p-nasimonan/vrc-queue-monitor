"""FastAPI Application - REST API Server"""

import os
import logging
from typing import List, Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict

from db import Database
from scheduler import ScheduleConfig

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

JST = ZoneInfo("Asia/Tokyo")


# Pydanticモデル定義
class MetricResponse(BaseModel):
    timestamp: datetime
    instance_id: int
    queue_size: int
    current_users: int
    pc_users: int = 0


class InstanceResponse(BaseModel):
    id: int
    location: str
    name: str
    display_name: Optional[str] = None
    world_name: str
    capacity: int
    world_thumbnail_url: Optional[str] = None
    world_image_url: Optional[str] = None
    instance_type: Optional[str] = None
    region: Optional[str] = None
    created_at: datetime
    is_active: bool


class InstanceWithMetricsResponse(BaseModel):
    id: int
    location: str
    name: str
    display_name: Optional[str] = None
    world_name: str
    capacity: int
    world_thumbnail_url: Optional[str] = None
    world_image_url: Optional[str] = None
    instance_type: Optional[str] = None
    region: Optional[str] = None
    created_at: datetime
    is_active: bool
    metrics: List[MetricResponse]


class EventGroupResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_date: str = Field(alias="eventDate")
    start_time: datetime = Field(alias="startTime")
    end_time: datetime = Field(alias="endTime")
    instances: List[InstanceWithMetricsResponse]

# Database instance
db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションライフサイクル管理"""
    # 起動時 — migration はコレクター (main.py) のみで実行するため、ここでは接続のみ行う
    logger.info("Starting FastAPI server...")
    db.connect()
    yield
    # 終了時
    logger.info("Shutting down FastAPI server...")
    db.close()


# FastAPIアプリケーション
app = FastAPI(
    title="VRC Queue Monitor API",
    description="VRChat グループインスタンスの待機列モニタリングAPI",
    version="1.0.0",
    lifespan=lifespan
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




@app.get("/api/config")
async def get_config():
    """現在の監視設定と次回収集開始時刻を取得"""
    schedule = ScheduleConfig()
    poll_interval = int(os.getenv("POLL_INTERVAL_MINUTES", "2"))
    next_start = schedule.get_next_start()

    return {
        "schedule_type": schedule.schedule_type,
        "schedule_days": schedule.schedule_days,
        "start_time": schedule.start_time.strftime("%H:%M"),
        "duration_minutes": schedule.duration_minutes,
        "poll_interval_minutes": poll_interval,
        "is_active_now": schedule.is_active_now(),
        "next_start": next_start.isoformat() if next_start else None,
    }


@app.get("/")
async def root():
    """ヘルスチェック"""
    return {
        "status": "ok",
        "message": "VRC Queue Monitor API is running",
        "version": "1.0.0"
    }


@app.get("/api/instances", response_model=List[InstanceResponse])
async def get_instances(active_only: bool = Query(True, description="アクティブなインスタンスのみ取得")):
    """インスタンス一覧を取得"""
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")

    try:
        with db.conn.cursor() as cur:
            if active_only:
                cur.execute("SELECT * FROM instances WHERE is_active = TRUE ORDER BY created_at DESC")
            else:
                cur.execute("SELECT * FROM instances ORDER BY created_at DESC")

            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

            instances = [dict(zip(columns, row)) for row in rows]
            return instances

    except Exception as e:
        logger.error(f"Error fetching instances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/instances/{instance_id}", response_model=InstanceResponse)
async def get_instance(instance_id: int):
    """特定のインスタンスを取得"""
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")

    try:
        with db.conn.cursor() as cur:
            cur.execute("SELECT * FROM instances WHERE id = %s", (instance_id,))
            columns = [desc[0] for desc in cur.description]
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Instance not found")

            return dict(zip(columns, row))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching instance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/event-groups", response_model=List[EventGroupResponse])
async def get_event_groups(days: int = Query(30, ge=1, le=90, description="取得する日数")):
    """イベント日ごとにグループ化されたデータを取得"""
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")

    try:
        # メトリクスを取得
        with db.conn.cursor() as cur:
            cur.execute("""
                SELECT
                    m.timestamp,
                    m.instance_id,
                    m.queue_size,
                    m.current_users,
                    m.pc_users,
                    i.location,
                    i.name as instance_name,
                    i.display_name,
                    i.world_name,
                    i.capacity,
                    i.world_thumbnail_url,
                    i.world_image_url,
                    i.instance_type,
                    i.region,
                    i.created_at,
                    i.is_active
                FROM metrics m
                JOIN instances i ON m.instance_id = i.id
                WHERE m.timestamp > NOW() - MAKE_INTERVAL(days => %s::integer)
                ORDER BY m.timestamp DESC
            """, (days,))

            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            metrics = [dict(zip(columns, row)) for row in rows]

        # インスタンス情報を取得（過去イベントのために非アクティブも含める）
        with db.conn.cursor() as cur:
            cur.execute("SELECT * FROM instances")
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            instances = {row[0]: dict(zip(columns, row)) for row in rows}

        # インスタンスの created_at（JST日付）でグループ化
        # → 日を跨いだイベントでも、インスタンスが作成された日に統一される
        def _instance_event_date(created_at: datetime) -> str:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            return created_at.astimezone(JST).strftime("%Y-%m-%d")

        event_map: dict[str, dict[int, list]] = {}

        for metric in metrics:
            instance_id = metric["instance_id"]
            inst = instances.get(instance_id)
            if not inst:
                continue

            event_key = _instance_event_date(inst["created_at"])
            event_map.setdefault(event_key, {}).setdefault(instance_id, []).append({
                "timestamp": metric["timestamp"],
                "instance_id": instance_id,
                "queue_size": metric["queue_size"],
                "current_users": metric["current_users"],
                "pc_users": metric.get("pc_users", 0),
            })

        # レスポンス構築
        result = []
        for event_date, instance_metrics in sorted(event_map.items(), reverse=True):
            event_instances = []
            all_timestamps = []

            for instance_id, metrics_list in instance_metrics.items():
                inst = instances[instance_id]
                sorted_metrics = sorted(metrics_list, key=lambda x: x["timestamp"])
                all_timestamps.extend(m["timestamp"] for m in sorted_metrics)
                event_instances.append({
                    "id": inst["id"],
                    "location": inst["location"],
                    "name": inst["name"],
                    "display_name": inst.get("display_name"),
                    "world_name": inst["world_name"],
                    "capacity": inst["capacity"],
                    "world_thumbnail_url": inst.get("world_thumbnail_url"),
                    "world_image_url": inst.get("world_image_url"),
                    "instance_type": inst.get("instance_type"),
                    "region": inst.get("region"),
                    "created_at": inst["created_at"],
                    "is_active": inst["is_active"],
                    "metrics": sorted_metrics,
                })

            if event_instances:
                result.append({
                    "eventDate": event_date,
                    "startTime": min(all_timestamps),
                    "endTime": max(all_timestamps),
                    "instances": event_instances,
                })

        return result

    except Exception as e:
        logger.error(f"Error fetching event groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/metrics", response_model=List[MetricResponse])
async def get_metrics(
    instance_id: Optional[int] = Query(None, description="インスタンスID"),
    hours: int = Query(24, ge=1, le=2160, description="取得する時間数（最大90日）")
):
    """メトリクス一覧を取得"""
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")

    try:
        with db.conn.cursor() as cur:
            if instance_id:
                cur.execute("""
                    SELECT timestamp, instance_id, queue_size, current_users
                    FROM metrics
                    WHERE instance_id = %s AND timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp DESC
                """, (instance_id, hours))
            else:
                cur.execute("""
                    SELECT timestamp, instance_id, queue_size, current_users
                    FROM metrics
                    WHERE timestamp > NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp DESC
                """, (hours,))

            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

            return [dict(zip(columns, row)) for row in rows]

    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "production") == "development"
    )

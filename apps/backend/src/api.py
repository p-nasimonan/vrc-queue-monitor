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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

JST = ZoneInfo("Asia/Tokyo")


# ---------------------------------------------------------------------------
# レスポンスモデル
# ---------------------------------------------------------------------------

class MetricResponse(BaseModel):
    timestamp: datetime
    instance_id: int
    queue_size: int     # 有効待機列数（計算済み）
    current_users: int  # インスタンス内ユーザー数（計算済み）
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


# ---------------------------------------------------------------------------
# ヘルパー（表示用の計算ロジック）
# ---------------------------------------------------------------------------

def _compute_metric(
    n_users: int,
    queue_size: int,
    capacity: int,
    legacy_current_users: int = 0,
) -> tuple[int, int]:
    """生値から (current_users, effective_queue_size) を計算する。

    n_users=0 は migration 前の旧データを示す可能性があるため legacy にフォールバック。
    queue_size は VRChat が返した値をそのまま信頼する（queue_enabled によるゲートは行わない）。
    """
    if n_users == 0 and legacy_current_users > 0:
        return legacy_current_users, queue_size

    if capacity > 0 and n_users > capacity:
        # n_users が capacity を超えている場合は超過分を待機列とする
        return capacity, n_users - capacity

    return n_users, queue_size


def _event_date_jst(created_at: datetime) -> str:
    """インスタンスの created_at を JST 日付文字列に変換する。"""
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at.astimezone(JST).strftime("%Y-%m-%d")


def _build_metric_response(row: dict) -> dict:
    """DB の生行から MetricResponse 用の dict を構築する。"""
    current_users, effective_queue = _compute_metric(
        row["n_users"],
        row["queue_size"],
        row["capacity"],
        row["legacy_current_users"],
    )
    return {
        "timestamp": row["timestamp"],
        "instance_id": row["instance_id"],
        "queue_size": effective_queue,
        "current_users": current_users,
        "pc_users": row["pc_users"] or 0,
    }


# ---------------------------------------------------------------------------
# アプリケーション
# ---------------------------------------------------------------------------

db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # migration はコレクター (main.py) のみで実行するため、ここでは接続のみ
    logger.info("Starting FastAPI server...")
    db.connect()
    yield
    logger.info("Shutting down FastAPI server...")
    db.close()


app = FastAPI(
    title="VRC Queue Monitor API",
    description="VRChat グループインスタンスの待機列モニタリングAPI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# エンドポイント
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "message": "VRC Queue Monitor API is running", "version": "1.0.0"}


@app.get("/api/config")
async def get_config():
    schedule = ScheduleConfig()
    next_start = schedule.get_next_start()
    return {
        "schedule_type": schedule.schedule_type,
        "schedule_days": schedule.schedule_days,
        "start_time": schedule.start_time.strftime("%H:%M"),
        "duration_minutes": schedule.duration_minutes,
        "poll_interval_minutes": int(os.getenv("POLL_INTERVAL_MINUTES", "2")),
        "is_active_now": schedule.is_active_now(),
        "next_start": next_start.isoformat() if next_start else None,
    }


@app.get("/api/instances", response_model=List[InstanceResponse])
async def get_instances(active_only: bool = Query(True)):
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")
    try:
        with db.conn.cursor() as cur:
            sql = "SELECT * FROM instances"
            if active_only:
                sql += " WHERE is_active = TRUE"
            sql += " ORDER BY created_at DESC"
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching instances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/instances/{instance_id}", response_model=InstanceResponse)
async def get_instance(instance_id: int):
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")
    try:
        with db.conn.cursor() as cur:
            cur.execute("SELECT * FROM instances WHERE id = %s", (instance_id,))
            cols = [d[0] for d in cur.description]
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Instance not found")
            return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching instance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/event-groups", response_model=List[EventGroupResponse])
async def get_event_groups(days: int = Query(30, ge=1, le=90)):
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")
    try:
        raw_metrics, instances = db.get_metrics_with_instances(days)

        # instances.created_at の JST 日付でグループ化
        event_map: dict[str, dict[int, list]] = {}
        for row in raw_metrics:
            inst = instances.get(row["instance_id"])
            if not inst:
                continue
            event_key = _event_date_jst(inst["created_at"])
            event_map.setdefault(event_key, {}).setdefault(row["instance_id"], []).append(
                _build_metric_response(row)
            )

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
    instance_id: Optional[int] = Query(None),
    hours: int = Query(24, ge=1, le=2160),
):
    if not db.ensure_connected():
        raise HTTPException(status_code=503, detail="Database connection error")
    try:
        rows = db.get_metrics_list(instance_id, hours)
        return [_build_metric_response(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port,
                reload=os.getenv("ENV", "production") == "development")

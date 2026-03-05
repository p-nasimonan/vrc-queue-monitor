"""FastAPI Application - REST API Server"""

import os
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import Database

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


# Pydanticモデル定義
class MetricResponse(BaseModel):
    timestamp: datetime
    instance_id: int
    queue_size: int
    current_users: int


class InstanceResponse(BaseModel):
    id: int
    location: str
    name: str
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
    event_date: str = Field(alias="eventDate")
    start_time: datetime = Field(alias="startTime")
    end_time: datetime = Field(alias="endTime")
    instances: List[InstanceWithMetricsResponse]

    class Config:
        populate_by_name = True


# Database instance
db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションライフサイクル管理"""
    # 起動時
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


def get_schedule_config():
    """スケジュール設定を取得"""
    start_time = os.getenv("SCHEDULE_START_TIME", "00:00")
    end_time = os.getenv("SCHEDULE_END_TIME", "23:59")
    return {"start_time": start_time, "end_time": end_time}


def calculate_event_period(date: datetime) -> tuple[datetime, datetime]:
    """イベント期間を計算"""
    config = get_schedule_config()
    start_hour, start_min = map(int, config["start_time"].split(":"))
    end_hour, end_min = map(int, config["end_time"].split(":"))

    start = date.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
    end = date.replace(hour=end_hour, minute=end_min, second=59, microsecond=999999)

    # 日をまたぐ場合
    if end_hour < start_hour or (end_hour == start_hour and end_min < start_min):
        end += timedelta(days=1)

    return start, end


def get_event_key(timestamp: datetime) -> str:
    """イベント日を特定するキーを生成"""
    config = get_schedule_config()
    start_hour = int(config["start_time"].split(":")[0])

    event_date = timestamp
    if event_date.hour < start_hour:
        event_date -= timedelta(days=1)

    return event_date.strftime("%Y-%m-%d")


def _calculate_next_start() -> Optional[datetime]:
    """次回収集開始時刻を計算（JST）"""
    from zoneinfo import ZoneInfo
    JST = ZoneInfo("Asia/Tokyo")

    schedule_type = os.getenv("SCHEDULE_TYPE", "always")
    schedule_days_str = os.getenv("SCHEDULE_DAYS", "")
    start_time_str = os.getenv("SCHEDULE_START_TIME", "00:00")

    # 常時監視の場合は「次回」という概念がない
    if schedule_type == "always":
        return None

    try:
        start_hour, start_min = map(int, start_time_str.split(":"))
    except (ValueError, IndexError):
        return None

    # 曜日マッピング
    day_map = {
        "mon": 0, "tue": 1, "wed": 2, "thu": 3,
        "fri": 4, "sat": 5, "sun": 6,
        "月": 0, "火": 1, "水": 2, "木": 3, "金": 4, "土": 5, "日": 6,
    }
    schedule_days = []
    if schedule_days_str:
        for part in schedule_days_str.lower().split(","):
            part = part.strip()
            if part in day_map:
                schedule_days.append(day_map[part])
            elif part.isdigit():
                schedule_days.append(int(part))

    now = datetime.now(JST)
    # 最大14日間探索
    for delta in range(0, 14):
        candidate = (now + timedelta(days=delta)).replace(
            hour=start_hour, minute=start_min, second=0, microsecond=0
        )
        if candidate <= now:
            continue

        if schedule_type == "weekday":
            if not schedule_days or candidate.weekday() in schedule_days:
                return candidate
        elif schedule_type == "day_of_month":
            if not schedule_days or candidate.day in schedule_days:
                return candidate
        else:
            return candidate

    return None


@app.get("/api/config")
async def get_config():
    """現在の監視設定と次回収集開始時刻を取得"""
    from zoneinfo import ZoneInfo
    JST = ZoneInfo("Asia/Tokyo")

    schedule_type = os.getenv("SCHEDULE_TYPE", "always")
    schedule_days_str = os.getenv("SCHEDULE_DAYS", "")
    start_time_str = os.getenv("SCHEDULE_START_TIME", "00:00")
    end_time_str = os.getenv("SCHEDULE_END_TIME", "23:59")
    poll_interval = int(os.getenv("POLL_INTERVAL_MINUTES", "2"))

    # 曜日マッピング
    day_map = {
        "mon": 0, "tue": 1, "wed": 2, "thu": 3,
        "fri": 4, "sat": 5, "sun": 6,
        "月": 0, "火": 1, "水": 2, "木": 3, "金": 4, "土": 5, "日": 6,
    }
    schedule_days: list[int] = []
    if schedule_days_str:
        for part in schedule_days_str.lower().split(","):
            part = part.strip()
            if part in day_map:
                schedule_days.append(day_map[part])
            elif part.isdigit():
                schedule_days.append(int(part))

    # 現在アクティブかどうか
    now = datetime.now(JST)
    is_active = True
    if schedule_type != "always":
        try:
            s_hour, s_min = map(int, start_time_str.split(":"))
            e_hour, e_min = map(int, end_time_str.split(":"))
            from datetime import time as dtime
            start_t = dtime(s_hour, s_min)
            end_t = dtime(e_hour, e_min)
            current_t = now.time().replace(second=0, microsecond=0)

            if schedule_type == "weekday" and schedule_days and now.weekday() not in schedule_days:
                is_active = False
            elif schedule_type == "day_of_month" and schedule_days and now.day not in schedule_days:
                is_active = False
            else:
                if start_t > end_t:  # 日またぎ
                    is_active = current_t >= start_t or current_t <= end_t
                else:
                    is_active = start_t <= current_t <= end_t
        except (ValueError, IndexError):
            pass

    next_start = _calculate_next_start()

    return {
        "schedule_type": schedule_type,
        "schedule_days": schedule_days,
        "start_time": start_time_str,
        "end_time": end_time_str,
        "poll_interval_minutes": poll_interval,
        "is_active_now": is_active,
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
                    i.location,
                    i.name as instance_name,
                    i.world_name,
                    i.capacity,
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

        # インスタンス情報を取得
        with db.conn.cursor() as cur:
            cur.execute("SELECT * FROM instances WHERE is_active = TRUE")
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            instances = {row[0]: dict(zip(columns, row)) for row in rows}

        # イベント日ごとにグループ化
        event_map = {}

        for metric in metrics:
            event_key = get_event_key(metric["timestamp"])

            if event_key not in event_map:
                event_map[event_key] = {}

            instance_id = metric["instance_id"]
            if instance_id not in event_map[event_key]:
                event_map[event_key][instance_id] = []

            event_map[event_key][instance_id].append({
                "timestamp": metric["timestamp"],
                "instance_id": instance_id,
                "queue_size": metric["queue_size"],
                "current_users": metric["current_users"],
            })

        # レスポンス構築
        result = []
        for event_date, instance_metrics in sorted(event_map.items(), reverse=True):
            date_obj = datetime.strptime(event_date, "%Y-%m-%d")
            start_time, end_time = calculate_event_period(date_obj)

            event_instances = []
            for instance_id, metrics_list in instance_metrics.items():
                if instance_id in instances:
                    inst = instances[instance_id]
                    event_instances.append({
                        "id": inst["id"],
                        "location": inst["location"],
                        "name": inst["name"],
                        "world_name": inst["world_name"],
                        "capacity": inst["capacity"],
                        "created_at": inst["created_at"],
                        "is_active": inst["is_active"],
                        "metrics": sorted(metrics_list, key=lambda x: x["timestamp"]),
                    })

            if event_instances:
                result.append({
                    "eventDate": event_date,
                    "startTime": start_time,
                    "endTime": end_time,
                    "instances": event_instances,
                })

        return result

    except Exception as e:
        logger.error(f"Error fetching event groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/metrics", response_model=List[MetricResponse])
async def get_metrics(
    instance_id: Optional[int] = Query(None, description="インスタンスID"),
    hours: int = Query(24, ge=1, le=168, description="取得する時間数")
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

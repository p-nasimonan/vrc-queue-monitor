"""収集ビジネスロジック

VRChat API からデータを取得して DB に保存する。
計算・表示ロジックは持たず、API が返す生値をそのまま渡す。
"""

import time
import logging
from vrc_api import VRChatAPI
from db import Database

logger = logging.getLogger(__name__)


def _extract_world_images(world: dict | object) -> tuple[str | None, str | None]:
    if isinstance(world, dict):
        thumbnail = world.get("thumbnail_image_url") or world.get("thumbnailImageUrl")
        image = world.get("image_url") or world.get("imageUrl")
    else:
        thumbnail = getattr(world, "thumbnail_image_url", None) or getattr(world, "thumbnailImageUrl", None)
        image = getattr(world, "image_url", None) or getattr(world, "imageUrl", None)
    return thumbnail, image


def discover_instances(api: VRChatAPI, db: Database, group_id: str) -> None:
    """グループのアクティブなインスタンスを取得して DB に同期する。"""
    try:
        logger.info("Discovering group instances...")
        group_instances = api.get_group_instances(group_id)

        if not group_instances:
            logger.info("No group instances found")
            deactivated = db.deactivate_missing_instances([])
            if deactivated:
                logger.info(f"Deactivated {deactivated} old instances")
            return

        active_locations = []
        for inst in group_instances:
            location = inst.get("location") or inst.get("instanceId")
            if not location:
                continue

            active_locations.append(location)
            world = inst.get("world", {})
            world_name = world.get("name", "Unknown") if isinstance(world, dict) else getattr(world, "name", "Unknown")
            thumbnail, image = _extract_world_images(world)

            db.upsert_instance(
                location=location,
                name=inst.get("name", "Unknown"),
                world_name=world_name,
                capacity=inst.get("capacity", 0),
                world_thumbnail_url=thumbnail,
                world_image_url=image,
                instance_type=inst.get("type", "unknown"),
                region=inst.get("region") or inst.get("photonRegion", "unknown"),
                display_name=inst.get("display_name") or inst.get("displayName") or None,
            )

        deactivated = db.deactivate_missing_instances(active_locations)
        if deactivated:
            logger.info(f"Deactivated {deactivated} old instances")
        logger.info(f"Discovered {len(group_instances)} instances")

    except Exception as e:
        logger.error(f"Error during instance discovery: {e}")


def collect_metrics(api: VRChatAPI, db: Database) -> None:
    """アクティブなインスタンスの生メトリクスを収集して DB に保存する。

    計算（current_users, effective_queue）は API 返却時に行うため、
    ここでは VRChat が返した値をそのまま渡す。
    """
    try:
        active_instances = db.get_active_instances()
        if not active_instances:
            logger.info("No active instances, skipping metrics collection")
            return

        logger.info(f"Collecting metrics for {len(active_instances)} instances...")
        saved = 0

        for inst in active_instances:
            location = inst["location"]
            if ":" not in location:
                continue

            world_id, instance_id = location.split(":", 1)
            detail = api.get_instance_detail(world_id, instance_id)
            if not detail:
                continue

            # --- 生値のみ取得（計算しない） ---
            n_users: int = detail.get("n_users", 0) or 0
            queue_size: int = detail.get("queue_size", 0) or 0
            queue_enabled: bool = bool(detail.get("queue_enabled") or False)
            capacity: int = detail.get("capacity", 0) or 0
            pc_users: int = (detail.get("platforms") or {}).get("standalonewindows", 0) or 0

            # インスタンス情報を detail の最新値で上書き（capacity 等が変わることがある）
            world = detail.get("world") or {}
            world_name = (
                world.get("name", inst["world_name"]) if isinstance(world, dict) else inst["world_name"]
            )
            thumbnail, image = _extract_world_images(world)
            db.upsert_instance(
                location=location,
                name=detail.get("name", inst["name"]),
                world_name=world_name,
                capacity=capacity,
                world_thumbnail_url=thumbnail or inst.get("world_thumbnail_url"),
                world_image_url=image or inst.get("world_image_url"),
                instance_type=detail.get("type", inst.get("instance_type", "unknown")),
                region=detail.get("region") or detail.get("photon_region") or inst.get("region", "unknown"),
                display_name=detail.get("display_name") or detail.get("displayName") or None,
            )

            if db.insert_metric(inst["id"], n_users, queue_size, queue_enabled, pc_users):
                saved += 1

            time.sleep(2.0)

        logger.info(f"Collection complete: {saved}/{len(active_instances)} saved")

    except Exception as e:
        logger.error(f"Error during metrics collection: {e}")

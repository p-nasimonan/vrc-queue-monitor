"""VRC Queue Monitor - Backend Entry Point"""

import os
import sys
import time
import logging
from datetime import datetime

from vrc_api import VRChatAPI
from db import Database
from scheduler import ScheduleConfig

log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def _extract_world_images(world: dict | object) -> tuple[str | None, str | None]:
    """ワールドオブジェクトからサムネイルURLと画像URLを取得（snake_case対応）"""
    if isinstance(world, dict):
        thumbnail = world.get("thumbnail_image_url") or world.get("thumbnailImageUrl")
        image = world.get("image_url") or world.get("imageUrl")
    else:
        thumbnail = getattr(world, "thumbnail_image_url", None) or getattr(world, "thumbnailImageUrl", None)
        image = getattr(world, "image_url", None) or getattr(world, "imageUrl", None)
    return thumbnail, image


def discover_instances(api: VRChatAPI, db: Database, group_id: str):
    """グループの新しいインスタンスを発見してDBに登録"""
    try:
        logger.info("Discovering group instances...")
        group_instances = api.get_group_instances(group_id)

        if not group_instances:
            logger.info("No group instances found")
            deactivated = db.deactivate_missing_instances([])
            if deactivated > 0:
                logger.info(f"Deactivated {deactivated} old instances")
            return

        active_locations = []

        for inst in group_instances:
            location = inst.get("location") or inst.get("instanceId")
            if not location:
                continue

            active_locations.append(location)

            name = inst.get("name", "Unknown")
            display_name = inst.get("display_name") or inst.get("displayName") or ""
            world = inst.get("world", {})
            world_name = world.get("name", "Unknown") if isinstance(world, dict) else getattr(world, "name", "Unknown")
            capacity = inst.get("capacity", 0)

            world_thumbnail_url, world_image_url = _extract_world_images(world)

            instance_type = inst.get("type", "unknown")
            region = inst.get("region") or inst.get("photonRegion", "unknown")

            db.upsert_instance(
                location, name, world_name, capacity,
                world_thumbnail_url, world_image_url,
                instance_type, region,
                display_name or None,
            )

        deactivated = db.deactivate_missing_instances(active_locations)
        if deactivated > 0:
            logger.info(f"Deactivated {deactivated} old instances")

        logger.info(f"Discovered {len(group_instances)} instances")

    except Exception as e:
        logger.error(f"Error during instance discovery: {e}")


def collect_metrics(api: VRChatAPI, db: Database):
    """アクティブなインスタンスのメトリクスを収集"""
    try:
        active_instances = db.get_active_instances()

        if not active_instances:
            logger.info("No active instances in database, run discovery first")
            return

        logger.info(f"Collecting metrics for {len(active_instances)} instances...")

        saved_count = 0
        for inst in active_instances:
            location = inst["location"]

            if ":" not in location:
                continue

            world_id, instance_id = location.split(":", 1)

            detail = api.get_instance_detail(world_id, instance_id)
            if not detail:
                continue

            queue_enabled = detail.get("queue_enabled", False) or False
            queue_size = detail.get("queue_size", 0) or 0
            n_users = detail.get("n_users", 0) or 0
            capacity = detail.get("capacity", 0) or 0

            if capacity > 0 and n_users > capacity:
                # APIがn_usersをcapacity超で返す場合のフォールバック計算
                queue_size = n_users - capacity
                current_users = capacity
            else:
                current_users = n_users
                # queue_size はAPIの値をそのまま使う（ここでリセットしない）

            platforms = detail.get("platforms") or {}
            pc_users = platforms.get("standalonewindows", 0) or 0

            display_name = detail.get("display_name") or detail.get("displayName") or None
            world = detail.get("world") or {}
            world_name = world.get("name", inst["world_name"]) if isinstance(world, dict) else inst["world_name"]
            world_thumbnail_url, world_image_url = _extract_world_images(world)
            instance_type = detail.get("type", inst.get("instance_type", "unknown"))
            region = detail.get("region") or detail.get("photon_region") or inst.get("region", "unknown")
            name = detail.get("name", inst["name"])

            db.upsert_instance(
                location, name, world_name, capacity,
                world_thumbnail_url or inst.get("world_thumbnail_url"),
                world_image_url or inst.get("world_image_url"),
                instance_type, region,
                display_name,
            )

            if db.insert_metric(inst["id"], queue_size if queue_enabled else 0, current_users, pc_users):
                saved_count += 1

            time.sleep(2.0)

        logger.info(f"Collection complete: {saved_count}/{len(active_instances)} metrics saved")

    except Exception as e:
        logger.error(f"Error during metrics collection: {e}")


def main():
    group_id = os.environ.get("VRC_GROUP_ID")
    if not group_id:
        logger.error("VRC_GROUP_ID environment variable is required")
        sys.exit(1)

    poll_interval = int(os.environ.get("POLL_INTERVAL_MINUTES", 2))
    discovery_interval = int(os.environ.get("DISCOVERY_INTERVAL_MINUTES", 10))

    schedule_config = ScheduleConfig()

    logger.info("=" * 50)
    logger.info("VRC Queue Monitor - Starting")
    logger.info(f"Group ID: {group_id}")
    logger.info(f"Metrics Poll Interval: {poll_interval} minutes")
    logger.info(f"Instance Discovery Interval: {discovery_interval} minutes")
    logger.info(f"Schedule: {schedule_config.get_status_message()}")
    logger.info("=" * 50)

    api = VRChatAPI()
    db = Database()

    if not db.connect():
        logger.error("Failed to connect to database")
        sys.exit(1)

    db.run_migrations()

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        logger.info(f"Attempting VRChat authentication (attempt {attempt}/{max_retries})...")
        if api.login():
            break
        if attempt < max_retries:
            if api._rate_limit_until:
                wait = (api._rate_limit_until - datetime.now()).total_seconds()
                if wait > 0:
                    logger.warning(f"Rate limited by VRChat. Waiting {wait:.0f}s before retry...")
                    time.sleep(wait)
            else:
                logger.warning("Authentication failed, retrying...")
        else:
            logger.error("Failed to authenticate with VRChat API after all retries")
            sys.exit(1)

    poll_interval_seconds = poll_interval * 60
    discovery_interval_seconds = discovery_interval * 60

    # 0 にしておくことで、最初の active tick に即実行される
    last_discovery = 0.0
    last_metrics = 0.0

    try:
        while True:
            now = time.time()

            if schedule_config.is_active_now():
                if now - last_discovery >= discovery_interval_seconds:
                    discover_instances(api, db, group_id)
                    last_discovery = now

                if now - last_metrics >= poll_interval_seconds:
                    collect_metrics(api, db)
                    last_metrics = now

            time.sleep(5)

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        api.close()
        db.close()
        logger.info("Goodbye!")


if __name__ == "__main__":
    main()

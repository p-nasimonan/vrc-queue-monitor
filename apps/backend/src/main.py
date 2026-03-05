"""VRC Queue Monitor - Backend Entry Point"""

import os
import sys
import time
import logging
import schedule

from vrc_api import VRChatAPI
from db import Database
from scheduler import ScheduleConfig

# ログ設定
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def discover_instances(api: VRChatAPI, db: Database, group_id: str):
    """グループの新しいインスタンスを発見してDBに登録（低頻度）"""
    try:
        logger.info("Discovering group instances...")
        group_instances = api.get_group_instances(group_id)

        if not group_instances:
            logger.info("No group instances found")
            return

        # インスタンスをDBに登録（メトリクスは取得しない）
        for inst in group_instances:
            location = inst.get("location") or inst.get("instanceId")
            if not location:
                continue

            name = inst.get("name", "Unknown")
            world = inst.get("world", {})
            world_name = world.get("name", "Unknown")
            capacity = inst.get("capacity", 0)

            # ワールド情報を抽出
            world_thumbnail_url = world.get("thumbnailImageUrl")
            world_image_url = world.get("imageUrl")

            # インスタンスタイプとリージョンを抽出
            instance_type = inst.get("type", "unknown")
            region = inst.get("region") or inst.get("photonRegion", "unknown")

            db.upsert_instance(
                location, name, world_name, capacity,
                world_thumbnail_url, world_image_url,
                instance_type, region
            )

        logger.info(f"Discovered {len(group_instances)} instances")

    except Exception as e:
        logger.error(f"Error during instance discovery: {e}")


def collect_metrics(api: VRChatAPI, db: Database, schedule_config: ScheduleConfig):
    """アクティブなインスタンスのメトリクスを収集（高頻度）"""

    # スケジュール確認
    if not schedule_config.is_active_now():
        logger.debug("Outside of scheduled monitoring period, skipping collection")
        return

    # バースト期間中かどうかをログ出力
    if schedule_config.is_in_burst_period():
        logger.info("📈 In BURST period - high frequency collection")

    try:
        # DBから既知のアクティブなインスタンスを取得
        active_instances = db.get_active_instances()

        if not active_instances:
            logger.info("No active instances in database, run discovery first")
            return

        logger.info(f"Collecting metrics for {len(active_instances)} instances...")

        # 各インスタンスの詳細を取得
        saved_count = 0
        for inst in active_instances:
            location = inst["location"]

            # location形式: wrld_xxx:12345~region(xx)
            if ":" not in location:
                continue

            world_id, instance_id = location.split(":", 1)

            # インスタンス詳細を取得（queueSize含む）
            detail = api.get_instance_detail(world_id, instance_id)
            if not detail:
                continue

            # メトリクスをDBに保存
            queue_enabled = detail.get("queueEnabled", False)
            queue_size = detail.get("queueSize", 0) if queue_enabled else 0
            current_users = detail.get("n_users", 0)

            if db.insert_metric(inst["id"], queue_size, current_users):
                saved_count += 1

            # Rate Limit対策
            time.sleep(2.0)

        logger.info(f"Collection complete: {saved_count}/{len(active_instances)} metrics saved")

    except Exception as e:
        logger.error(f"Error during metrics collection: {e}")


def main():
    """メインエントリーポイント"""
    # 環境変数チェック
    group_id = os.environ.get("VRC_GROUP_ID")
    if not group_id:
        logger.error("VRC_GROUP_ID environment variable is required")
        sys.exit(1)

    # メトリクス収集間隔（高頻度）
    poll_interval = int(os.environ.get("POLL_INTERVAL_MINUTES", 2))
    # インスタンス発見間隔（低頻度）
    discovery_interval = int(os.environ.get("DISCOVERY_INTERVAL_MINUTES", 10))

    # スケジュール設定
    schedule_config = ScheduleConfig()

    logger.info("=" * 50)
    logger.info("VRC Queue Monitor - Starting")
    logger.info(f"Group ID: {group_id}")
    logger.info(f"Metrics Poll Interval: {poll_interval} minutes")
    logger.info(f"Instance Discovery Interval: {discovery_interval} minutes")
    logger.info(f"Schedule: {schedule_config.get_status_message()}")
    logger.info("=" * 50)

    # 初期化
    api = VRChatAPI()
    db = Database()

    # DB接続確認
    if not db.connect():
        logger.error("Failed to connect to database")
        sys.exit(1)

    # VRChat認証確認（リトライあり）
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        logger.info(f"Attempting VRChat authentication (attempt {attempt}/{max_retries})...")
        if api.login():
            break
        if attempt < max_retries:
            logger.warning(f"Authentication failed, retrying...")
        else:
            logger.error("Failed to authenticate with VRChat API after all retries")
            sys.exit(1)

    # 初回: インスタンス発見
    logger.info("Running initial instance discovery...")
    discover_instances(api, db, group_id)

    # 初回: メトリクス収集（スケジュール範囲内なら）
    if schedule_config.is_active_now():
        logger.info("Running initial metrics collection...")
        collect_metrics(api, db, schedule_config)
    else:
        logger.info("Outside of scheduled period, waiting for next active window...")

    # スケジュール設定（動的間隔）
    # インスタンス発見は固定間隔
    schedule.every(discovery_interval).minutes.do(
        discover_instances, api=api, db=db, group_id=group_id
    )

    logger.info(f"Scheduled: metrics adaptive (burst: {schedule_config.burst_interval_seconds}s, "
                f"normal: {poll_interval}min), discovery every {discovery_interval}min")

    # メインループ（動的間隔制御）
    last_metrics_collection = time.time()
    try:
        while True:
            schedule.run_pending()

            # 動的なメトリクス収集間隔
            now = time.time()
            current_interval_minutes = schedule_config.get_current_poll_interval(poll_interval)
            interval_seconds = current_interval_minutes * 60

            if now - last_metrics_collection >= interval_seconds:
                if schedule_config.is_active_now():
                    collect_metrics(api, db, schedule_config)
                last_metrics_collection = now

            time.sleep(5)  # 5秒ごとにチェック（バースト期間対応）
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        api.close()
        db.close()
        logger.info("Goodbye!")


if __name__ == "__main__":
    main()

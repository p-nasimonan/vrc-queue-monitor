"""VRC Queue Monitor - Backend Entry Point"""

import os
import sys
import time
import logging
import schedule

from vrc_api import VRChatAPI
from db import Database

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def collect_metrics(api: VRChatAPI, db: Database, group_id: str):
    """メトリクスを収集してDBに保存"""
    logger.info(f"Starting metrics collection for group: {group_id}")

    try:
        # インスタンス情報を取得（queueSize含む）
        instances = api.get_instances_with_queue(group_id)

        if not instances:
            logger.warning("No instances found or API error")
            return

        # DBに保存
        saved = db.save_instance_metrics(instances)
        logger.info(f"Collection complete: {saved} metrics saved")

    except Exception as e:
        logger.error(f"Error during metrics collection: {e}")


def main():
    """メインエントリーポイント"""
    # 環境変数チェック
    group_id = os.environ.get("VRC_GROUP_ID")
    if not group_id:
        logger.error("VRC_GROUP_ID environment variable is required")
        sys.exit(1)

    poll_interval = int(os.environ.get("POLL_INTERVAL_MINUTES", 2))

    logger.info("=" * 50)
    logger.info("VRC Queue Monitor - Starting")
    logger.info(f"Group ID: {group_id}")
    logger.info(f"Poll Interval: {poll_interval} minutes")
    logger.info("=" * 50)

    # 初期化
    api = VRChatAPI()
    db = Database()

    # DB接続確認
    if not db.connect():
        logger.error("Failed to connect to database")
        sys.exit(1)

    # VRChat認証確認
    if not api.login():
        logger.error("Failed to authenticate with VRChat API")
        sys.exit(1)

    # 初回実行
    logger.info("Running initial collection...")
    collect_metrics(api, db, group_id)

    # スケジュール設定
    schedule.every(poll_interval).minutes.do(
        collect_metrics, api=api, db=db, group_id=group_id
    )

    logger.info(f"Scheduled to run every {poll_interval} minutes")

    # メインループ
    try:
        while True:
            schedule.run_pending()
            time.sleep(10)  # 10秒ごとにスケジュール確認
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        db.close()
        logger.info("Goodbye!")


if __name__ == "__main__":
    main()

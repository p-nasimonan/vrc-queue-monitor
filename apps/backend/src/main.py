"""VRC Queue Monitor - Collector Entry Point"""

import os
import sys
import time
import logging
from datetime import datetime

from vrc_api import VRChatAPI
from db import Database
from scheduler import ScheduleConfig
from collector import discover_instances, collect_metrics

log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def main() -> None:
    group_id = os.environ.get("VRC_GROUP_ID")
    if not group_id:
        logger.error("VRC_GROUP_ID environment variable is required")
        sys.exit(1)

    poll_interval = int(os.environ.get("POLL_INTERVAL_MINUTES", 2))
    discovery_interval = int(os.environ.get("DISCOVERY_INTERVAL_MINUTES", 10))
    schedule = ScheduleConfig()

    logger.info("=" * 50)
    logger.info("VRC Queue Monitor - Starting")
    logger.info(f"Group ID: {group_id}")
    logger.info(f"Poll: {poll_interval}min  Discovery: {discovery_interval}min")
    logger.info(f"Schedule: {schedule.get_status_message()}")
    logger.info("=" * 50)

    api = VRChatAPI()
    db = Database()

    if not db.connect():
        logger.error("Failed to connect to database")
        sys.exit(1)

    db.run_migrations()

    # VRChat 認証（最大3回、レート制限は待機してからリトライ）
    for attempt in range(1, 4):
        logger.info(f"VRChat authentication attempt {attempt}/3...")
        if api.login():
            break
        if attempt < 3:
            if api._rate_limit_until:
                wait = (api._rate_limit_until - datetime.now()).total_seconds()
                if wait > 0:
                    logger.warning(f"Rate limited, waiting {wait:.0f}s...")
                    time.sleep(wait)
        else:
            logger.error("Authentication failed after 3 attempts")
            sys.exit(1)

    poll_seconds = poll_interval * 60
    discovery_seconds = discovery_interval * 60
    last_discovery = last_metrics = 0.0

    try:
        while True:
            now = time.time()
            if schedule.is_active_now():
                if now - last_discovery >= discovery_seconds:
                    discover_instances(api, db, group_id)
                    last_discovery = now
                if now - last_metrics >= poll_seconds:
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

"""VRChat API レスポンス構造確認用スクリプト"""

import os
import sys
import json
import logging

# srcディレクトリをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from vrc_api import VRChatAPI

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def main():
    group_id = os.environ.get("VRC_GROUP_ID")
    if not group_id:
        logger.error("VRC_GROUP_ID is required")
        sys.exit(1)

    api = VRChatAPI()

    if not api.login():
        logger.error("Login failed")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("Fetching group instances...")
    logger.info("=" * 60)

    instances = api.get_instances_with_queue(group_id, request_interval=2.0)

    if instances:
        logger.info(f"\nFound {len(instances)} instances")
        for i, inst in enumerate(instances, 1):
            logger.info(f"\n--- Instance {i} ---")
            logger.info(f"Name: {inst.get('name')}")
            logger.info(f"Location: {inst.get('location')}")
            logger.info(f"Capacity: {inst.get('capacity')}")
            logger.info(f"\nUser count fields:")
            logger.info(f"  n_users: {inst.get('n_users')}")
            logger.info(f"  userCount: {inst.get('userCount')}")
            logger.info(f"  user_count: {inst.get('user_count')}")
            logger.info(f"\nQueue size fields:")
            logger.info(f"  queueSize: {inst.get('queueSize')}")
            logger.info(f"  queue_size: {inst.get('queue_size')}")
            logger.info(f"\nAll keys: {list(inst.keys())}")

        # 最初のインスタンスの全データをJSON出力
        logger.info("\n" + "=" * 60)
        logger.info("First instance full data:")
        logger.info("=" * 60)
        print(json.dumps(instances[0], indent=2, default=str))
    else:
        logger.warning("No instances found")

    api.close()

if __name__ == "__main__":
    main()

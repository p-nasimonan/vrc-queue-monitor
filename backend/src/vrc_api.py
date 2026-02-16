"""VRChat API操作クラス"""

import os
import time
import logging
from typing import Optional
import requests
import pyotp

logger = logging.getLogger(__name__)


class VRChatAPI:
    """VRChat APIクライアント"""

    BASE_URL = "https://api.vrchat.cloud/api/1"
    USER_AGENT = "vrc-queue-monitor/1.0"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.USER_AGENT,
        })
        self._authenticated = False

    def login(self) -> bool:
        """VRChatにログインし、セッションを確立する"""
        username = os.environ.get("VRC_USERNAME")
        password = os.environ.get("VRC_PASSWORD")
        totp_secret = os.environ.get("TOTP_SECRET")

        if not username or not password:
            logger.error("VRC_USERNAME or VRC_PASSWORD not set")
            return False

        try:
            # 基本認証でログイン
            response = self.session.get(
                f"{self.BASE_URL}/auth/user",
                auth=(username, password)
            )

            if response.status_code == 200:
                data = response.json()
                # 2FA必要かチェック
                if "requiresTwoFactorAuth" in data:
                    if not totp_secret:
                        logger.error("2FA required but TOTP_SECRET not set")
                        return False

                    # TOTPコード生成して送信
                    totp = pyotp.TOTP(totp_secret)
                    code = totp.now()

                    # 2FA認証（TOTP）
                    verify_response = self.session.post(
                        f"{self.BASE_URL}/auth/twofactorauth/totp/verify",
                        json={"code": code}
                    )

                    if verify_response.status_code != 200:
                        logger.error(f"2FA verification failed: {verify_response.text}")
                        return False

                    # 2FA後に再度ユーザー情報取得
                    response = self.session.get(f"{self.BASE_URL}/auth/user")
                    if response.status_code != 200:
                        logger.error(f"Post-2FA auth failed: {response.text}")
                        return False

                self._authenticated = True
                logger.info(f"Logged in as: {response.json().get('displayName', 'Unknown')}")
                return True

            logger.error(f"Login failed: {response.status_code} - {response.text}")
            return False

        except Exception as e:
            logger.error(f"Login error: {e}")
            return False

    def ensure_authenticated(self) -> bool:
        """認証済みか確認し、必要ならログインする"""
        if self._authenticated:
            # セッション有効性確認
            try:
                response = self.session.get(f"{self.BASE_URL}/auth/user")
                if response.status_code == 200:
                    return True
                self._authenticated = False
            except Exception:
                self._authenticated = False

        return self.login()

    def get_group_instances(self, group_id: str) -> list[dict]:
        """グループのアクティブなインスタンス一覧を取得"""
        if not self.ensure_authenticated():
            return []

        try:
            response = self.session.get(f"{self.BASE_URL}/groups/{group_id}/instances")

            if response.status_code == 200:
                instances = response.json()
                logger.info(f"Found {len(instances)} active instances")
                return instances

            logger.error(f"Failed to get group instances: {response.status_code}")
            return []

        except Exception as e:
            logger.error(f"Error getting group instances: {e}")
            return []

    def get_instance_detail(self, location: str) -> Optional[dict]:
        """インスタンスの詳細情報（queueSize含む）を取得"""
        if not self.ensure_authenticated():
            return None

        try:
            response = self.session.get(f"{self.BASE_URL}/instances/{location}")

            if response.status_code == 200:
                return response.json()

            logger.warning(f"Failed to get instance detail for {location}: {response.status_code}")
            return None

        except Exception as e:
            logger.error(f"Error getting instance detail: {e}")
            return None

    def get_instances_with_queue(self, group_id: str, request_interval: float = 1.0) -> list[dict]:
        """
        グループの全インスタンスとそのqueueSizeを取得

        Args:
            group_id: VRChatグループID
            request_interval: リクエスト間隔（秒）- Rate Limit対策

        Returns:
            インスタンス詳細情報のリスト（queueSize含む）
        """
        instances = self.get_group_instances(group_id)
        if not instances:
            return []

        results = []
        for i, instance in enumerate(instances):
            location = instance.get("location") or instance.get("instanceId")
            if not location:
                continue

            detail = self.get_instance_detail(location)
            if detail:
                results.append(detail)

            # Rate Limit対策（最後のリクエスト以外）
            if i < len(instances) - 1:
                time.sleep(request_interval)

        logger.info(f"Retrieved details for {len(results)} instances")
        return results

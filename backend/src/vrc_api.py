"""VRChat API操作クラス (vrchatapi SDK使用)"""

import os
import time
import logging
from typing import Optional

import vrchatapi
from vrchatapi.api import authentication_api, groups_api, instances_api
from vrchatapi.exceptions import UnauthorizedException, ApiException
from vrchatapi.models.two_factor_auth_code import TwoFactorAuthCode
import pyotp

logger = logging.getLogger(__name__)


class VRChatAPI:
    """VRChat APIクライアント (SDK版)"""

    def __init__(self):
        self.api_client: Optional[vrchatapi.ApiClient] = None
        self.auth_api: Optional[authentication_api.AuthenticationApi] = None
        self.groups_api: Optional[groups_api.GroupsApi] = None
        self.instances_api: Optional[instances_api.InstancesApi] = None
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
            # Configuration作成
            configuration = vrchatapi.Configuration(
                username=username,
                password=password,
            )

            # APIクライアント作成
            self.api_client = vrchatapi.ApiClient(configuration)
            self.api_client.user_agent = "vrc-queue-monitor/1.0 (https://github.com/your-repo)"

            # API インスタンス作成
            self.auth_api = authentication_api.AuthenticationApi(self.api_client)
            self.groups_api = groups_api.GroupsApi(self.api_client)
            self.instances_api = instances_api.InstancesApi(self.api_client)

            try:
                # ログイン試行
                current_user = self.auth_api.get_current_user()
            except UnauthorizedException as e:
                if e.status == 200:
                    # 2FA必要
                    if "2 Factor Authentication" in str(e.reason):
                        if not totp_secret:
                            logger.error("2FA required but TOTP_SECRET not set")
                            return False

                        try:
                            totp = pyotp.TOTP(totp_secret)
                            code = totp.now()
                            self.auth_api.verify2_fa(
                                two_factor_auth_code=TwoFactorAuthCode(code)
                            )
                            current_user = self.auth_api.get_current_user()
                        except Exception as e2:
                            logger.error(f"2FA verification failed: {e2}")
                            return False
                    else:
                        logger.error(f"Authentication failed: {e.reason}")
                        return False
                else:
                    logger.error(f"Login failed: {e}")
                    return False

            self._authenticated = True
            logger.info(f"Logged in as: {current_user.display_name}")
            return True

        except ApiException as e:
            logger.error(f"API Exception during login: {e}")
            return False
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False

    def ensure_authenticated(self) -> bool:
        """認証済みか確認し、必要ならログインする"""
        if self._authenticated and self.auth_api:
            try:
                self.auth_api.get_current_user()
                return True
            except Exception:
                self._authenticated = False

        return self.login()

    def get_group_instances(self, group_id: str) -> list[dict]:
        """グループのアクティブなインスタンス一覧を取得"""
        if not self.ensure_authenticated():
            return []

        try:
            instances = self.groups_api.get_group_instances(group_id)
            logger.info(f"Found {len(instances)} active instances")
            return [inst.to_dict() for inst in instances]

        except ApiException as e:
            logger.error(f"Failed to get group instances: {e}")
            return []
        except Exception as e:
            logger.error(f"Error getting group instances: {e}")
            return []

    def get_instance_detail(self, world_id: str, instance_id: str) -> Optional[dict]:
        """インスタンスの詳細情報（queueSize含む）を取得"""
        if not self.ensure_authenticated():
            return None

        try:
            instance = self.instances_api.get_instance(world_id, instance_id)
            return instance.to_dict()

        except ApiException as e:
            logger.warning(f"Failed to get instance detail: {e}")
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
            # locationからworld_idとinstance_idを分離
            location = instance.get("location") or instance.get("instance_id")
            if not location:
                continue

            # location形式: wrld_xxx:12345~region(xx)
            if ":" in location:
                world_id, instance_id = location.split(":", 1)
            else:
                logger.warning(f"Invalid location format: {location}")
                continue

            detail = self.get_instance_detail(world_id, instance_id)
            if detail:
                results.append(detail)

            # Rate Limit対策（最後のリクエスト以外）
            if i < len(instances) - 1:
                time.sleep(request_interval)

        logger.info(f"Retrieved details for {len(results)} instances")
        return results

    def close(self):
        """APIクライアントをクローズ"""
        if self.api_client:
            self.api_client.close()
            self._authenticated = False

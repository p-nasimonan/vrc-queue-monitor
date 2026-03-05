"""VRChat API操作クラス (vrchatapi SDK使用)"""

import os
import time
import logging
from typing import Optional
from datetime import datetime, timedelta

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
        self._last_login_attempt: Optional[datetime] = None
        self._rate_limit_until: Optional[datetime] = None

    def login(self) -> bool:
        """VRChatにログインし、セッションを確立する"""
        # レート制限チェック
        now = datetime.now()
        if self._rate_limit_until and now < self._rate_limit_until:
            wait_seconds = (self._rate_limit_until - now).total_seconds()
            logger.warning(f"Rate limited. Waiting {wait_seconds:.0f} seconds before retry...")
            time.sleep(wait_seconds)

        # 最後のログイン試行から最低5秒は待つ
        if self._last_login_attempt:
            elapsed = (now - self._last_login_attempt).total_seconds()
            if elapsed < 5:
                wait = 5 - elapsed
                logger.info(f"Waiting {wait:.1f}s before login attempt...")
                time.sleep(wait)

        self._last_login_attempt = datetime.now()

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
            self._rate_limit_until = None  # ログイン成功でリセット
            logger.info(f"Logged in as: {current_user.display_name}")
            return True

        except ApiException as e:
            # Retry-After ヘッダーをチェック
            if hasattr(e, 'headers') and 'Retry-After' in e.headers:
                retry_after = int(e.headers['Retry-After'])
                self._rate_limit_until = datetime.now() + timedelta(seconds=retry_after)
                logger.error(f"Rate limited. Retry after {retry_after} seconds")
            else:
                logger.error(f"API Exception during login: {e}")
            return False
        except Exception as e:
            logger.error(f"Login error: {e}")
            return False

    def ensure_authenticated(self) -> bool:
        """認証済みか確認し、必要ならログインする"""
        if self._authenticated and self.auth_api:
            # 既に認証済みならそのまま返す（毎回チェックしない）
            return True

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
        try:
            instance = self.instances_api.get_instance(world_id, instance_id)
            instance_dict = instance.to_dict()
            # デバッグ: APIレスポンスのキーを確認
            logger.debug(f"Instance API response keys: {list(instance_dict.keys())}")
            if logger.level <= logging.DEBUG:
                logger.debug(f"Instance detail: name={instance_dict.get('name')}, "
                           f"queueSize={instance_dict.get('queueSize')}, "
                           f"queue_size={instance_dict.get('queue_size')}, "
                           f"n_users={instance_dict.get('n_users')}, "
                           f"userCount={instance_dict.get('userCount')}")
            return instance_dict

        except UnauthorizedException as e:
            # 認証切れの場合は再ログイン
            logger.warning(f"Authentication expired, retrying login...")
            self._authenticated = False
            if self.ensure_authenticated():
                try:
                    instance = self.instances_api.get_instance(world_id, instance_id)
                    return instance.to_dict()
                except Exception as retry_e:
                    logger.error(f"Retry failed: {retry_e}")
                    return None
            return None
        except ApiException as e:
            logger.warning(f"Failed to get instance detail ({world_id}:{instance_id}): {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting instance detail: {e}")
            return None

    def get_instances_with_queue(self, group_id: str, request_interval: float = 2.0) -> list[dict]:
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

            # Rate Limit対策（リクエスト前に待機）
            if i > 0:
                time.sleep(request_interval)

            detail = self.get_instance_detail(world_id, instance_id)
            if detail:
                results.append(detail)

        logger.info(f"Retrieved details for {len(results)} instances")
        return results

    def close(self):
        """APIクライアントをクローズ"""
        if self.api_client:
            self.api_client.close()
            self._authenticated = False

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

    def _normalize_instance_dict(self, instance) -> dict:
        """
        SDK Instance オブジェクトから必要なフィールドを snake_case に正規化した dict を返す。

        vrchatapi SDK は to_dict() で camelCase キーを返す場合があり、
        またオブジェクト属性と辞書キーで命名が異なることがある。
        このメソッドを経由することで呼び出し元は常に snake_case キーを期待できる。
        """
        instance_dict = instance.to_dict()

        # 生のAPIレスポンス確認（DEBUG時のみ）
        logger.debug(f"--- RAW API RESPONSE DUMP ---")
        logger.debug(str({k: v for k, v in instance_dict.items() if v is not None}))

        # queue フィールド（SDKバージョンによって snake_case / camelCase が混在）
        queue_enabled = (
            getattr(instance, 'queue_enabled', None)
            if hasattr(instance, 'queue_enabled')
            else instance_dict.get('queueEnabled', instance_dict.get('queue_enabled'))
        )
        queue_size = (
            getattr(instance, 'queue_size', None)
            if hasattr(instance, 'queue_size')
            else instance_dict.get('queueSize', instance_dict.get('queue_size'))
        )

        # n_users / user_count（SDKの仕様揺れ対策）
        n_users = getattr(
            instance, 'n_users',
            getattr(instance, 'user_count', instance_dict.get('n_users', 0))
        )
        user_count = getattr(
            instance, 'user_count',
            instance_dict.get('user_count', instance_dict.get('userCount'))
        )

        capacity = getattr(instance, 'capacity', instance_dict.get('capacity', 0))
        name = (
            getattr(instance, 'name', None)
            or getattr(instance, 'instance_id', None)
            or instance_dict.get('name', instance_dict.get('instanceId'))
        )

        logger.debug(
            f"Normalized {name}: n_users={n_users}, user_count={user_count}, "
            f"queue_enabled={queue_enabled}, queue_size={queue_size}, capacity={capacity}"
        )

        instance_dict['name'] = name
        instance_dict['queue_enabled'] = queue_enabled
        instance_dict['queue_size'] = queue_size
        instance_dict['n_users'] = n_users
        if user_count is not None:
            instance_dict['user_count'] = user_count

        return instance_dict

    def get_instance_detail(self, world_id: str, instance_id: str) -> Optional[dict]:
        """インスタンスの詳細情報（queueSize含む）を取得"""
        if not self.ensure_authenticated() or self.instances_api is None:
            return None
        try:
            instance = self.instances_api.get_instance(world_id, instance_id)
            return self._normalize_instance_dict(instance)

        except UnauthorizedException:
            # 認証切れ → 再ログインして1回だけリトライ
            logger.warning("Authentication expired, re-logging in...")
            self._authenticated = False
            if not self.ensure_authenticated() or self.instances_api is None:
                return None
            try:
                instance = self.instances_api.get_instance(world_id, instance_id)
                return self._normalize_instance_dict(instance)
            except Exception as retry_e:
                logger.error(f"Retry after re-auth failed: {retry_e}")
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

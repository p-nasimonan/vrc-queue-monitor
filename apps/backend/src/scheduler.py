"""スケジュール管理モジュール"""

import os
import logging
from datetime import datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# 日本時間
JST = ZoneInfo("Asia/Tokyo")


class ScheduleConfig:
    """監視スケジュール設定"""

    def __init__(self):
        # 環境変数から設定を読み込み
        self.schedule_type = os.environ.get("SCHEDULE_TYPE", "always")
        self.schedule_days = self._parse_days(os.environ.get("SCHEDULE_DAYS", ""))
        self.start_time = self._parse_time(os.environ.get("SCHEDULE_START_TIME", "00:00"))
        self.end_time = self._parse_time(os.environ.get("SCHEDULE_END_TIME", "23:59"))
        self.timezone = JST

        # イベント開始時の高頻度収集設定
        self.burst_duration_minutes = int(os.environ.get("BURST_DURATION_MINUTES", 5))
        self.burst_interval_seconds = int(os.environ.get("BURST_INTERVAL_SECONDS", 30))

        # 最後にアクティブ期間が始まった時刻を記録
        self._last_schedule_start: Optional[datetime] = None
        self._was_active = False

        logger.info(f"Schedule config: type={self.schedule_type}, days={self.schedule_days}, "
                   f"time={self.start_time}-{self.end_time}, "
                   f"burst={self.burst_duration_minutes}min @ {self.burst_interval_seconds}s")

    def _parse_days(self, days_str: str) -> list[int]:
        """
        曜日/日付文字列をパース

        フォーマット:
        - 曜日: "mon,tue,wed" or "0,1,2" (0=月曜)
        - 日付: "5,15,25" (5のつく日など)

        Returns:
            曜日の場合: [0-6] (0=月曜, 6=日曜)
            日付の場合: [1-31]
        """
        if not days_str:
            return []

        day_map = {
            "mon": 0, "tue": 1, "wed": 2, "thu": 3,
            "fri": 4, "sat": 5, "sun": 6,
            "月": 0, "火": 1, "水": 2, "木": 3,
            "金": 4, "土": 5, "日": 6,
        }

        result = []
        for part in days_str.lower().split(","):
            part = part.strip()
            if part in day_map:
                result.append(day_map[part])
            elif part.isdigit():
                result.append(int(part))

        return result

    def _parse_time(self, time_str: str) -> time:
        """時刻文字列をパース (HH:MM形式)"""
        try:
            parts = time_str.split(":")
            return time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            logger.warning(f"Invalid time format: {time_str}, using default")
            return time(0, 0)

    def is_active_now(self) -> bool:
        """現在時刻が監視対象期間かどうか"""
        now = datetime.now(self.timezone)
        is_active = self.is_active_at(now)

        # アクティブ期間の開始を検知
        if is_active and not self._was_active:
            self._last_schedule_start = now
            logger.info(f"Schedule period started at {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        elif not is_active and self._was_active:
            logger.info(f"Schedule period ended at {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")

        self._was_active = is_active
        return is_active

    def is_active_at(self, dt: datetime) -> bool:
        """指定時刻が監視対象期間かどうか"""
        # 常時監視
        if self.schedule_type == "always":
            return True

        current_time = dt.time()
        is_overnight = self.start_time > self.end_time

        # 日をまたぐ場合（例: 22:00〜02:30）、深夜側（00:00〜02:30）は
        # 「前日のスケジュール」として判定する
        if is_overnight and current_time <= self.end_time:
            check_dt = dt - timedelta(days=1)
        else:
            check_dt = dt

        # 曜日ベース
        if self.schedule_type == "weekday":
            if self.schedule_days and check_dt.weekday() not in self.schedule_days:
                return False

        # 日付ベース (5のつく日など)
        elif self.schedule_type == "day_of_month":
            if self.schedule_days and check_dt.day not in self.schedule_days:
                return False

        # 時間範囲チェック
        if is_overnight:
            return current_time >= self.start_time or current_time <= self.end_time
        else:
            return self.start_time <= current_time <= self.end_time

    def _get_schedule_start_datetime(self, now: datetime) -> Optional[datetime]:
        """
        現在のスケジュール期間における開始日時（SCHEDULE_START_TIME 基準）を返す。
        日をまたぐ場合、深夜側（end_time 以前）にいるときは前日の start_time を返す。
        """
        current_time = now.time()
        is_overnight = self.start_time > self.end_time

        if is_overnight and current_time <= self.end_time:
            # 深夜側: 前日の start_time が今の期間の開始
            start_date = (now - timedelta(days=1)).date()
        else:
            start_date = now.date()

        naive_start = datetime.combine(start_date, self.start_time)
        return naive_start.replace(tzinfo=self.timezone)

    def is_in_burst_period(self) -> bool:
        """
        イベント開始直後の高頻度収集期間（バースト期間）かどうか。

        SCHEDULE_START_TIME の時刻を基準に経過時間を計算する。
        サービス起動タイミングに関係なく、設定された開始時刻から
        burst_duration_minutes 分以内であればバースト期間と判定する。

        Returns:
            True: バースト期間中
            False: 通常期間（always モードおよびバースト期間外）
        """
        # 常時監視モードではバースト期間を使用しない
        if self.schedule_type == "always":
            return False

        if not self.is_active_now():
            return False

        now = datetime.now(self.timezone)
        schedule_start = self._get_schedule_start_datetime(now)
        elapsed = now - schedule_start

        return timedelta(0) <= elapsed <= timedelta(minutes=self.burst_duration_minutes)

    def get_current_poll_interval(self, normal_interval_minutes: int) -> float:
        """
        現在の収集間隔を取得（分単位）

        Args:
            normal_interval_minutes: 通常時の収集間隔（分）

        Returns:
            現在の収集間隔（分）
        """
        if self.is_in_burst_period():
            return self.burst_interval_seconds / 60.0
        return float(normal_interval_minutes)

    def get_status_message(self) -> str:
        """現在のスケジュール状態を説明するメッセージ"""
        if self.schedule_type == "always":
            msg = "Always monitoring"
        else:
            days_str = ",".join(str(d) for d in self.schedule_days) if self.schedule_days else "all"

            if self.schedule_type == "weekday":
                weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                days_str = ",".join(weekday_names[d] for d in self.schedule_days) if self.schedule_days else "all"
                msg = f"Weekdays: {days_str}, {self.start_time}-{self.end_time} JST"
            elif self.schedule_type == "day_of_month":
                msg = f"Days: {days_str}, {self.start_time}-{self.end_time} JST"
            else:
                msg = f"Custom: {self.schedule_type}"

        # バースト設定を追加
        msg += f" (burst: first {self.burst_duration_minutes}min @ {self.burst_interval_seconds}s)"
        return msg

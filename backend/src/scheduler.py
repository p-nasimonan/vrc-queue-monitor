"""スケジュール管理モジュール"""

import os
import logging
from datetime import datetime, time
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

        logger.info(f"Schedule config: type={self.schedule_type}, days={self.schedule_days}, "
                   f"time={self.start_time}-{self.end_time}")

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
        return self.is_active_at(now)

    def is_active_at(self, dt: datetime) -> bool:
        """指定時刻が監視対象期間かどうか"""
        # 常時監視
        if self.schedule_type == "always":
            return True

        # 曜日ベース
        if self.schedule_type == "weekday":
            if not self.schedule_days:
                return True
            if dt.weekday() not in self.schedule_days:
                return False

        # 日付ベース (5のつく日など)
        elif self.schedule_type == "day_of_month":
            if not self.schedule_days:
                return True
            if dt.day not in self.schedule_days:
                return False

        # 時間範囲チェック
        current_time = dt.time()

        # 日をまたぐ場合 (例: 22:00 - 02:00)
        if self.start_time > self.end_time:
            return current_time >= self.start_time or current_time <= self.end_time
        else:
            return self.start_time <= current_time <= self.end_time

    def get_status_message(self) -> str:
        """現在のスケジュール状態を説明するメッセージ"""
        if self.schedule_type == "always":
            return "Always monitoring"

        days_str = ",".join(str(d) for d in self.schedule_days) if self.schedule_days else "all"

        if self.schedule_type == "weekday":
            weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            days_str = ",".join(weekday_names[d] for d in self.schedule_days) if self.schedule_days else "all"
            return f"Weekdays: {days_str}, {self.start_time}-{self.end_time} JST"

        elif self.schedule_type == "day_of_month":
            return f"Days: {days_str}, {self.start_time}-{self.end_time} JST"

        return f"Custom: {self.schedule_type}"

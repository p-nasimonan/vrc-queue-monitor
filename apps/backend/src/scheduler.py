"""スケジュール管理モジュール"""

import os
import logging
from datetime import datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

JST = ZoneInfo("Asia/Tokyo")


class ScheduleConfig:
    """監視スケジュール設定"""

    def __init__(self):
        self.schedule_type = os.environ.get("SCHEDULE_TYPE", "always")
        self.schedule_days = self._parse_days(os.environ.get("SCHEDULE_DAYS", ""))
        self.start_time = self._parse_time(os.environ.get("SCHEDULE_START_TIME", "00:00"))
        self.duration_minutes = int(os.environ.get("SCHEDULE_DURATION_MINUTES", 1440))
        self.timezone = JST

        logger.info(
            f"Schedule config: type={self.schedule_type}, days={self.schedule_days}, "
            f"start={self.start_time}, duration={self.duration_minutes}min"
        )

    def _parse_days(self, days_str: str) -> list[int]:
        """曜日/日付文字列をパース"""
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
        return self.is_active_at(datetime.now(self.timezone))

    def _day_matches(self, date) -> bool:
        """指定した date がスケジュール対象の曜日/日付かどうか"""
        if not self.schedule_days:
            return True
        if self.schedule_type == "weekday":
            return date.weekday() in self.schedule_days
        if self.schedule_type == "day_of_month":
            return date.day in self.schedule_days
        return True

    def _find_schedule_start(self, dt: datetime) -> Optional[datetime]:
        """
        dt が含まれるスケジュール期間の開始日時を返す。
        当日・前日の start_time を候補として探す。
        """
        duration = timedelta(minutes=self.duration_minutes)
        for delta_days in (0, 1):
            candidate_date = (dt - timedelta(days=delta_days)).date()
            start = datetime.combine(candidate_date, self.start_time).replace(tzinfo=self.timezone)
            if start <= dt <= start + duration and self._day_matches(candidate_date):
                return start
        return None

    def is_active_at(self, dt: datetime) -> bool:
        """指定時刻が監視対象期間かどうか"""
        if self.schedule_type == "always":
            return True
        return self._find_schedule_start(dt) is not None

    def get_next_start(self) -> Optional[datetime]:
        """次回の収集開始時刻を返す (always モードは None)"""
        if self.schedule_type == "always":
            return None

        now = datetime.now(self.timezone)
        for delta in range(0, 14):
            candidate = (now + timedelta(days=delta)).replace(
                hour=self.start_time.hour,
                minute=self.start_time.minute,
                second=0, microsecond=0,
            )
            if candidate <= now:
                continue
            if self._day_matches(candidate):
                return candidate
        return None

    def get_status_message(self) -> str:
        """現在のスケジュール状態を説明するメッセージ"""
        if self.schedule_type == "always":
            return "Always monitoring"

        if self.schedule_type == "weekday":
            weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            days_str = ",".join(weekday_names[d] for d in self.schedule_days) if self.schedule_days else "all"
            msg = f"Weekdays: {days_str}"
        elif self.schedule_type == "day_of_month":
            days_str = ",".join(str(d) for d in self.schedule_days) if self.schedule_days else "all"
            msg = f"Days: {days_str}"
        else:
            msg = f"Custom: {self.schedule_type}"

        return f"{msg}, {self.start_time} + {self.duration_minutes}min JST"

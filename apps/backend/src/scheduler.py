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
        self.duration_minutes = int(os.environ.get("SCHEDULE_DURATION_MINUTES", 1440))  # デフォルト24時間
        self.timezone = JST

        # イベント開始時の高頻度収集設定
        self.burst_duration_minutes = int(os.environ.get("BURST_DURATION_MINUTES", 5))
        self.burst_interval_seconds = int(os.environ.get("BURST_INTERVAL_SECONDS", 30))

        self._was_active = False

        logger.info(
            f"Schedule config: type={self.schedule_type}, days={self.schedule_days}, "
            f"start={self.start_time}, duration={self.duration_minutes}min, "
            f"burst={self.burst_duration_minutes}min @ {self.burst_interval_seconds}s"
        )

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

        if is_active and not self._was_active:
            logger.info(f"Schedule period started at {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        elif not is_active and self._was_active:
            logger.info(f"Schedule period ended at {now.strftime('%Y-%m-%d %H:%M:%S %Z')}")

        self._was_active = is_active
        return is_active

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
        当日・前日の start_time を候補として、dt が [start, start+duration] に
        入っていればその start を返す。どちらにも含まれなければ None。
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

    def is_in_burst_period(self) -> bool:
        """
        イベント開始直後のバースト期間かどうか。
        SCHEDULE_START_TIME を起点に経過時間を計算するため、
        サービスの起動タイミングに依存しない。
        always モードではバースト期間は使用しない。
        """
        if self.schedule_type == "always":
            return False

        now = datetime.now(self.timezone)
        schedule_start = self._find_schedule_start(now)
        if schedule_start is None:
            return False

        elapsed = now - schedule_start
        return elapsed <= timedelta(minutes=self.burst_duration_minutes)

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
            if self.schedule_type == "weekday":
                weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                days_str = ",".join(weekday_names[d] for d in self.schedule_days) if self.schedule_days else "all"
                msg = f"Weekdays: {days_str}"
            elif self.schedule_type == "day_of_month":
                days_str = ",".join(str(d) for d in self.schedule_days) if self.schedule_days else "all"
                msg = f"Days: {days_str}"
            else:
                msg = f"Custom: {self.schedule_type}"
            msg += f", {self.start_time} + {self.duration_minutes}min JST"

        msg += f" (burst: first {self.burst_duration_minutes}min @ {self.burst_interval_seconds}s)"
        return msg

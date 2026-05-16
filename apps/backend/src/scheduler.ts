const JST = "Asia/Tokyo";

type ScheduleType = "always" | "weekday" | "day_of_month";

const DAY_MAP: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
  月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6,
};

function parseTime(str: string): { hour: number; minute: number } {
  const [h, m] = str.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

function parseDays(str: string): number[] {
  if (!str) return [];
  return str.toLowerCase().split(",").flatMap((part) => {
    part = part.trim();
    if (part in DAY_MAP) return [DAY_MAP[part]!];
    const n = parseInt(part);
    return isNaN(n) ? [] : [n];
  });
}

function nowJst(): Date {
  // Returns a Date whose .getFullYear()/.getMonth() etc. are NOT in JST,
  // but we use Intl to extract JST components instead.
  return new Date();
}

function jstComponents(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    year: parseInt(parts.year!),
    month: parseInt(parts.month!) - 1,
    day: parseInt(parts.day!),
    hour: parseInt(parts.hour!),
    minute: parseInt(parts.minute!),
    second: parseInt(parts.second!),
    // weekday: 0=Mon ... 6=Sun (ISO)
    weekday: (d.getDay() + 6) % 7, // JS Sunday=0, convert to Mon=0
  };
}

function jstDateMs(year: number, month: number, day: number, hour: number, minute: number): number {
  // Create a Date representing the given wall-clock time in JST
  const utcStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
  return new Date(utcStr).getTime();
}

export class ScheduleConfig {
  readonly scheduleType: ScheduleType;
  readonly scheduleDays: number[];
  readonly startHour: number;
  readonly startMinute: number;
  readonly startTimeStr: string;
  readonly durationMinutes: number;

  constructor() {
    this.scheduleType = (process.env.SCHEDULE_TYPE ?? "always") as ScheduleType;
    this.scheduleDays = parseDays(process.env.SCHEDULE_DAYS ?? "");
    const t = parseTime(process.env.SCHEDULE_START_TIME ?? "00:00");
    this.startHour = t.hour;
    this.startMinute = t.minute;
    this.startTimeStr = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
    this.durationMinutes = parseInt(process.env.SCHEDULE_DURATION_MINUTES ?? "1440");

    console.log(
      `[scheduler] type=${this.scheduleType} days=${this.scheduleDays} ` +
      `start=${this.startTimeStr} duration=${this.durationMinutes}min`
    );
  }

  private dayMatches(weekdayOrDay: number): boolean {
    if (this.scheduleDays.length === 0) return true;
    return this.scheduleDays.includes(weekdayOrDay);
  }

  private findScheduleStartMs(nowMs: number): number | null {
    const durationMs = this.durationMinutes * 60_000;
    for (const deltaDays of [0, 1]) {
      const candidateMs = nowMs - deltaDays * 86_400_000;
      const c = jstComponents(new Date(candidateMs));
      const startMs = jstDateMs(c.year, c.month, c.day, this.startHour, this.startMinute);
      const matchVal = this.scheduleType === "weekday" ? c.weekday : c.day;
      if (startMs <= nowMs && nowMs <= startMs + durationMs && this.dayMatches(matchVal)) {
        return startMs;
      }
    }
    return null;
  }

  isActiveNow(): boolean {
    if (this.scheduleType === "always") return true;
    return this.findScheduleStartMs(Date.now()) !== null;
  }

  getNextStart(): Date | null {
    if (this.scheduleType === "always") return null;

    const now = Date.now();
    for (let delta = 0; delta < 14; delta++) {
      const candidateMs = now + delta * 86_400_000;
      const c = jstComponents(new Date(candidateMs));
      const startMs = jstDateMs(c.year, c.month, c.day, this.startHour, this.startMinute);
      if (startMs <= now) continue;
      const matchVal = this.scheduleType === "weekday" ? c.weekday : c.day;
      if (this.dayMatches(matchVal)) return new Date(startMs);
    }
    return null;
  }

  statusMessage(): string {
    if (this.scheduleType === "always") return "Always monitoring";
    const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daysStr = this.scheduleDays.length > 0
      ? (this.scheduleType === "weekday"
        ? this.scheduleDays.map((d) => weekdayNames[d]).join(",")
        : this.scheduleDays.join(","))
      : "all";
    return `${this.scheduleType}: ${daysStr}, ${this.startTimeStr} +${this.durationMinutes}min JST`;
  }
}

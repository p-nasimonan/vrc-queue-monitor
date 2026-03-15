"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { css } from "../../styled-system/css";
import type { Metric } from "@/lib/api";
import { useChartSettings } from "@/contexts/ChartSettings";
import { config } from "@/lib/config";

interface QueueChartProps {
  metrics: Metric[];
  capacity: number;
  height?: number;
  timezone?: string;
}

interface ChartPoint {
  time: string;
  users: number;
  queue: number;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}

// Recharts の CustomTooltip は Recharts が DOM 外に描画するため css() を使用
const tooltipWrapperClass = css({
  bg: "bg.card",
  border: "1px solid",
  borderColor: "border",
  borderRadius: "lg",
  px: 3,
  py: 2,
  fontSize: "xs",
  boxShadow: "md",
});
const tooltipLabelClass = css({ fontWeight: "700", mb: 1, color: "text" });
const tooltipRowClass = css({ my: "1px" });

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={tooltipWrapperClass}>
      <p className={tooltipLabelClass}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} className={tooltipRowClass} style={{ color: p.color }}>
          {p.name === "users" ? "参加中" : "待機列"}: {p.value}人
        </p>
      ))}
    </div>
  );
}

/**
 * タイムスタンプ文字列をUTCのUnixミリ秒に変換する。
 * バックエンドがタイムゾーン情報なしで返す場合（"2026-03-15T15:01:00"）も
 * UTCとして解釈することで、ブラウザのローカルタイム誤解釈を防ぐ。
 */
function parseUtcMs(ts: string): number {
  if (!ts.endsWith("Z") && !/[+\-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + "Z").getTime();
  }
  return new Date(ts).getTime();
}

function filterByRange(metrics: Metric[], rangeHours: number, timezone: string): ChartPoint[] {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const filtered =
    rangeHours <= 0
      ? metrics
      : (() => {
          const latest = metrics[metrics.length - 1];
          if (!latest) return metrics;
          const cutoff = parseUtcMs(latest.timestamp) - rangeHours * 60 * 60 * 1000;
          return metrics.filter((m) => parseUtcMs(m.timestamp) >= cutoff);
        })();

  return filtered.map((m) => ({
    time: fmt(parseUtcMs(m.timestamp)),
    users: m.current_users,
    queue: m.queue_size,
  }));
}

export function QueueChart({ metrics, capacity, height = 180, timezone }: QueueChartProps) {
  const { rangeHours } = useChartSettings();
  const tz = timezone ?? config.timezone;

  const data = filterByRange(metrics, rangeHours, tz);
  const maxValue = Math.max(capacity > 0 ? capacity : 0, ...data.map((d) => d.users + d.queue), 1);
  const xInterval = Math.max(0, Math.floor(data.length / 8) - 1);

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9A9088",
          fontSize: "13px",
        }}
      >
        データなし
      </div>
    );
  }

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`ug-${metrics[0]?.instance_id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3D7EC8" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#3D7EC8" stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id={`qg-${metrics[0]?.instance_id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D4841A" stopOpacity={0.85} />
              <stop offset="95%" stopColor="#D4841A" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: "#9A9088" }}
            tickLine={false}
            axisLine={false}
            interval={xInterval}
          />
          <YAxis
            domain={[0, maxValue + Math.ceil(maxValue * 0.08)]}
            tick={{ fontSize: 9, fill: "#9A9088" }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(v: number) => String(v)}
          />
          <Tooltip content={<CustomTooltip />} />
          {capacity > 0 && (
            <ReferenceLine
              y={capacity}
              stroke="#3D7EC8"
              strokeDasharray="4 2"
              strokeWidth={1}
              opacity={0.4}
            />
          )}
          <Area
            type="monotone"
            dataKey="users"
            name="users"
            stackId="1"
            stroke="#3D7EC8"
            strokeWidth={1.5}
            fill={`url(#ug-${metrics[0]?.instance_id})`}
            dot={false}
            activeDot={{ r: 3, fill: "#3D7EC8" }}
          />
          <Area
            type="monotone"
            dataKey="queue"
            name="queue"
            stackId="1"
            stroke="#D4841A"
            strokeWidth={1.5}
            fill={`url(#qg-${metrics[0]?.instance_id})`}
            dot={false}
            activeDot={{ r: 3, fill: "#D4841A" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

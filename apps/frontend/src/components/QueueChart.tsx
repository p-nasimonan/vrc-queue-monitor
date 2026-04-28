"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** 複数チャートの時間軸揃え用。EventSection から渡す [startMs, endMs] */
  timeRangeMs?: [number, number];
}

interface ChartPoint {
  ts: number;   // XAxis の dataKey（ms タイムスタンプ）
  users: number;
  queue: number;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
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

/**
 * バックエンドがタイムゾーン情報なしで返す場合もUTCとして解釈する。
 * ブラウザのローカルタイム誤解釈を防ぐ。
 */
export function parseUtcMs(ts: string): number {
  if (!ts.endsWith("Z") && !/[+\-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + "Z").getTime();
  }
  return new Date(ts).getTime();
}

function buildPoints(
  metrics: Metric[],
  rangeHours: number,
  offsetSteps: number,
  timeRangeMs: [number, number] | undefined,
): { points: ChartPoint[]; domain: [number, number] } {
  if (metrics.length === 0) {
    const now = Date.now();
    return { points: [], domain: timeRangeMs ?? [now - 3_600_000, now] };
  }

  // 範囲スライダーの基準: timeRangeMs があればその終端、なければ自データの最新
  const refEndMs = timeRangeMs?.[1] ?? parseUtcMs(metrics[metrics.length - 1].timestamp);

  let filtered: Metric[];
  let domain: [number, number];

  if (rangeHours <= 0) {
    filtered = metrics;
    if (timeRangeMs) {
      domain = timeRangeMs;
    } else {
      const s = parseUtcMs(metrics[0].timestamp);
      const e = parseUtcMs(metrics[metrics.length - 1].timestamp);
      const pad = Math.max((e - s) * 0.03, 60_000);
      domain = [s - pad, e + pad];
    }
  } else {
    const rangeMs = rangeHours * 3_600_000;
    const windowEnd = refEndMs - offsetSteps * rangeMs;
    const windowStart = windowEnd - rangeMs;
    filtered = metrics.filter((m) => {
      const ts = parseUtcMs(m.timestamp);
      return ts >= windowStart && ts <= windowEnd;
    });
    const pad = rangeMs * 0.02;
    domain = [windowStart - pad, windowEnd + pad];
  }

  const points: ChartPoint[] = filtered.map((m) => ({
    ts: parseUtcMs(m.timestamp),
    users: m.current_users,
    queue: m.queue_size,
  }));

  return { points, domain };
}

export function QueueChart({ metrics, capacity, height = 180, timezone, timeRangeMs }: QueueChartProps) {
  const { rangeHours, offsetSteps } = useChartSettings();
  const tz = timezone ?? config.timezone;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { points, domain } = buildPoints(metrics, rangeHours, offsetSteps, timeRangeMs);

  // ドメインを6等分した tick 位置
  const ticks = useMemo(() => {
    const [s, e] = domain;
    const n = 6;
    return Array.from({ length: n }, (_, i) => Math.round(s + (i * (e - s)) / (n - 1)));
  }, [domain]);

  const tickFmt = (ms: number) =>
    new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const maxValue = Math.max(
    capacity > 0 ? capacity : 0,
    ...points.map((d) => d.users + d.queue),
    1,
  );

  if (!mounted || points.length === 0) {
    return (
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.muted",
          fontSize: "sm",
        })}
        style={{ height }}
      >
        {mounted ? "データなし" : null}
      </div>
    );
  }

  const gradId = metrics[0]?.instance_id ?? 0;

  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`ug-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3D7EC8" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#3D7EC8" stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id={`qg-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D4841A" stopOpacity={0.85} />
              <stop offset="95%" stopColor="#D4841A" stopOpacity={0.2} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="ts"
            type="number"
            domain={domain}
            ticks={ticks}
            tickFormatter={tickFmt}
            tick={{ fontSize: 9, fill: "#9A9088" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, maxValue + Math.ceil(maxValue * 0.08)]}
            tick={{ fontSize: 9, fill: "#9A9088" }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(v: number) => String(v)}
          />
          <Tooltip
            content={(props) => {
              const { active, label, payload } = props as any;
              if (!active || !payload || payload.length === 0 || label == null) return null;
              const timeStr = new Date(label).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: tz,
              });
              return (
                <div className={tooltipWrapperClass}>
                  <p className={tooltipLabelClass}>{timeStr}</p>
                  {payload.map((p: TooltipPayload) => (
                    <p key={p.name} className={tooltipRowClass} style={{ color: p.color }}>
                      {p.name === "users" ? "参加中" : "待機列"}: {p.value}人
                    </p>
                  ))}
                </div>
              );
            }}
          />
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
            fill={`url(#ug-${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: "#3D7EC8" }}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="queue"
            name="queue"
            stackId="1"
            stroke="#D4841A"
            strokeWidth={1.5}
            fill={`url(#qg-${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: "#D4841A" }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

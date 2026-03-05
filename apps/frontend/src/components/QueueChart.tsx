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
import type { Metric } from "@/lib/api";

interface QueueChartProps {
  metrics: Metric[];
  capacity: number;
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

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "rgba(253, 250, 245, 0.97)",
        border: "1px solid #E5CEAC",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        boxShadow: "0 2px 8px rgba(80,50,20,0.1)",
      }}
    >
      <p style={{ fontWeight: "bold", marginBottom: 4, color: "#4F3B1E" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, margin: "2px 0" }}>
          {p.name === "users" ? "参加中" : "待機列"}: {p.value}人
        </p>
      ))}
    </div>
  );
}

export function QueueChart({ metrics, capacity }: QueueChartProps) {
  const data = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    users: m.current_users,
    queue: m.queue_size,
  }));

  const maxValue = Math.max(capacity, ...data.map((d) => d.users + d.queue));

  if (data.length === 0) {
    return (
      <div
        style={{
          height: 160,
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
    <div style={{ height: 180, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
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
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, maxValue + Math.ceil(maxValue * 0.05)]}
            tick={{ fontSize: 9, fill: "#9A9088" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* 定員ライン */}
          <ReferenceLine
            y={capacity}
            stroke="#3D7EC8"
            strokeDasharray="4 2"
            strokeWidth={1}
            opacity={0.4}
          />
          {/* 参加者（下層） */}
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
          {/* 待機列（上積み） */}
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

"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { css } from "../../styled-system/css";
import type { Metric } from "@/lib/api";

interface QueueChartProps {
  metrics: Metric[];
  capacity: number;
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

  const maxValue = Math.max(
    capacity,
    ...data.map((d) => d.users + d.queue)
  );

  if (data.length === 0) {
    return (
      <div
        className={css({
          h: "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.muted",
          fontSize: "sm",
        })}
      >
        データなし
      </div>
    );
  }

  return (
    <div className={css({ h: "140px", w: "100%" })}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id={`usersGrad-${metrics[0]?.instance_id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1E88E5" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#1E88E5" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id={`queueGrad-${metrics[0]?.instance_id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF9800" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#FF9800" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, maxValue + Math.ceil(maxValue * 0.05)]}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 253, 247, 0.95)",
              border: "1px solid #FFE799",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ fontWeight: "bold" }}
            formatter={(value: number, name: string) => [
              `${value}人`,
              name === "users" ? "参加中" : "待機列",
            ]}
          />
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: "10px" }}
            formatter={(value) => (value === "users" ? "参加中" : "待機列")}
          />
          {/* 定員ライン */}
          <ReferenceLine
            y={capacity}
            stroke="#1E88E5"
            strokeDasharray="4 2"
            strokeWidth={1}
            opacity={0.5}
          />
          {/* 参加者（下層） */}
          <Area
            type="monotone"
            dataKey="users"
            name="users"
            stackId="1"
            stroke="#1E88E5"
            strokeWidth={1.5}
            fill={`url(#usersGrad-${metrics[0]?.instance_id})`}
            dot={false}
            activeDot={{ r: 3 }}
          />
          {/* 待機列（上積み） */}
          <Area
            type="monotone"
            dataKey="queue"
            name="queue"
            stackId="1"
            stroke="#FF9800"
            strokeWidth={1.5}
            fill={`url(#queueGrad-${metrics[0]?.instance_id})`}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

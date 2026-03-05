"use client";

import { useEffect, useState } from "react";
import { css } from "../../styled-system/css";
import { fetchConfig, type MonitorConfig } from "@/lib/api";

// 曜日名（月曜=0）
const WEEKDAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"] as const;

function formatScheduleType(config: MonitorConfig): string {
    if (config.schedule_type === "always") return "常時";
    if (config.schedule_type === "weekday") {
        if (config.schedule_days.length === 0) return "毎日";
        return config.schedule_days.map((d) => WEEKDAY_NAMES[d] ?? d).join("・") + "曜日";
    }
    if (config.schedule_type === "day_of_month") {
        if (config.schedule_days.length === 0) return "毎日";
        return config.schedule_days.map((d) => `${d}日`).join("・");
    }
    return config.schedule_type;
}

function formatNextStart(isoStr: string | null): string {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d.toLocaleString("ja-JP", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function ConfigPanel() {
    const [config, setConfig] = useState<MonitorConfig | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        fetchConfig()
            .then(setConfig)
            .catch((e) => console.error("設定の取得に失敗:", e));
    }, []);

    if (!config) return null;

    return (
        <div
            className={css({
                borderTop: "1px solid",
                borderColor: "border",
                bg: "bg",
            })}
        >
            {/* トグルボタン */}
            <button
                onClick={() => setOpen((v) => !v)}
                className={css({
                    w: "100%",
                    px: 6,
                    py: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    cursor: "pointer",
                    bg: "transparent",
                    border: "none",
                    color: "text.muted",
                    fontSize: "xs",
                    _hover: { color: "text" },
                    transition: "color 0.2s",
                })}
            >
                <span
                    className={css({
                        transition: "transform 0.2s",
                        transform: open ? "rotate(90deg)" : "rotate(0deg)",
                        display: "inline-block",
                    })}
                >
                    ▶
                </span>
                監視設定
                {/* アクティブ状態バッジ */}
                <span
                    className={css({
                        ml: 2,
                        px: 2,
                        py: "1px",
                        borderRadius: "full",
                        fontSize: "xs",
                        fontWeight: "bold",
                        bg: config.is_active_now ? "vrc.success" : "warm.300",
                        color: config.is_active_now ? "white" : "warm.800",
                    })}
                >
                    {config.is_active_now ? "🟢 収集中" : "⏸ 待機中"}
                </span>
            </button>

            {/* 展開パネル */}
            {open && (
                <div
                    className={css({
                        px: 6,
                        pb: 3,
                        display: "grid",
                        gridTemplateColumns: { base: "1fr 1fr", md: "repeat(4, 1fr)" },
                        gap: 4,
                    })}
                >
                    <Item label="スケジュール" value={formatScheduleType(config)} />
                    <Item label="収集時間帯" value={`${config.start_time} 〜 ${config.end_time}`} />
                    <Item label="収集間隔" value={`${config.poll_interval_minutes} 分ごと`} />
                    <Item
                        label={config.schedule_type === "always" ? "次回" : "次回収集開始"}
                        value={config.schedule_type === "always" ? "常時収集中" : formatNextStart(config.next_start)}
                        highlight={!config.is_active_now}
                    />
                </div>
            )}
        </div>
    );
}

function Item({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div>
            <p className={css({ fontSize: "xs", color: "text.muted", mb: "1px" })}>{label}</p>
            <p
                className={css({
                    fontSize: "sm",
                    fontWeight: "600",
                    color: highlight ? "vrc.primary" : "text",
                })}
            >
                {value}
            </p>
        </div>
    );
}

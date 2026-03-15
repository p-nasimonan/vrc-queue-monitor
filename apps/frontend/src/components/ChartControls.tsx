"use client";

import { css } from "../../styled-system/css";
import { useChartSettings } from "@/contexts/ChartSettings";

const RANGES: { value: number; label: string }[] = [
  { value: 0, label: "全範囲" },
  { value: 0.5, label: "30分" },
  { value: 1, label: "1時間" },
  { value: 1.5, label: "1時間半" },
  { value: 3, label: "3時間" },
  { value: 5, label: "5時間" },
];

export function ChartControls() {
  const { rangeHours, setRangeHours, offsetSteps, setOffsetSteps } = useChartSettings();

  return (
    <div
      className={css({
        // PC: sticky top (normal flow); Mobile: fixed bottom
        position: { base: "fixed", md: "sticky" },
        bottom: { base: 0, md: "auto" },
        top: { base: "auto", md: 0 },
        left: { base: 0, md: "auto" },
        right: { base: 0, md: "auto" },
        zIndex: 40,
        bg: "bg.card",
        borderBottom: { base: "none", md: "1px solid" },
        borderTop: { base: "1px solid", md: "none" },
        borderColor: "border",
        boxShadow: { base: "0 -2px 12px rgba(0,0,0,0.08)", md: "0 2px 8px rgba(0,0,0,0.05)" },
      })}
    >
      <div
        className={css({
          maxW: "1400px",
          mx: "auto",
          px: 4,
          py: { base: 3, md: 2 },
          display: "flex",
          alignItems: "center",
          gap: { base: 2, md: 2 },
        })}
      >
        <span
          className={css({
            fontSize: "xs",
            color: "text.muted",
            fontWeight: "600",
            mr: 1,
            whiteSpace: "nowrap",
          })}
        >
          範囲
        </span>
        <div className={css({ display: "flex", gap: { base: 2, md: 1 }, flexWrap: "wrap" })}>
          {RANGES.map(({ value, label }) => {
            const isActive = rangeHours === value;
            return (
              <button
                key={value}
                onClick={() => setRangeHours(value)}
                className={css({
                  px: { base: 4, md: 3 },
                  py: { base: 2, md: 1 },
                  borderRadius: "md",
                  fontSize: { base: "sm", md: "xs" },
                  fontWeight: "700",
                  border: "1px solid",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  bg: isActive ? "accent" : "bg.subtle",
                  color: isActive ? "white" : "text.muted",
                  borderColor: isActive ? "accent" : "border",
                  _hover: {
                    bg: isActive ? "accent" : "bg.hover",
                    color: isActive ? "white" : "text",
                  },
                })}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 範囲選択時のみ表示: 時間窓を前後にずらす */}
        {rangeHours > 0 && (
          <div className={css({ display: "flex", alignItems: "center", gap: 1, ml: 2 })}>
            <button
              onClick={() => setOffsetSteps(offsetSteps + 1)}
              title="前の時間帯"
              className={css({
                px: 2,
                py: { base: 2, md: 1 },
                borderRadius: "md",
                fontSize: { base: "sm", md: "xs" },
                fontWeight: "700",
                border: "1px solid",
                borderColor: "border",
                bg: "bg.subtle",
                color: "text.muted",
                cursor: "pointer",
                _hover: { bg: "bg.hover", color: "text" },
              })}
            >
              ◀
            </button>
            {offsetSteps > 0 && (
              <span className={css({ fontSize: "xs", color: "text.muted", minW: "3ch", textAlign: "center" })}>
                -{offsetSteps}
              </span>
            )}
            <button
              onClick={() => setOffsetSteps(Math.max(0, offsetSteps - 1))}
              disabled={offsetSteps === 0}
              title="新しい時間帯"
              className={css({
                px: 2,
                py: { base: 2, md: 1 },
                borderRadius: "md",
                fontSize: { base: "sm", md: "xs" },
                fontWeight: "700",
                border: "1px solid",
                borderColor: "border",
                bg: "bg.subtle",
                color: offsetSteps === 0 ? "text.subtle" : "text.muted",
                cursor: offsetSteps === 0 ? "not-allowed" : "pointer",
                opacity: offsetSteps === 0 ? 0.4 : 1,
                _hover: offsetSteps === 0 ? {} : { bg: "bg.hover", color: "text" },
              })}
            >
              ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

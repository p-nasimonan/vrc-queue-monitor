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
  const { rangeHours, setRangeHours } = useChartSettings();

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
        <span
          className={css({
            fontSize: "2xs",
            color: "text.muted",
            ml: 2,
            display: { base: "none", sm: "inline" },
          })}
        >
          すべてのチャートに適用
        </span>
      </div>
    </div>
  );
}

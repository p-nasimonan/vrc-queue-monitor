"use client";

import { css, cx } from "../../styled-system/css";
import { ThemeToggle } from "./ThemeToggle";
import { config } from "@/lib/config";
import { ConfigPanel } from "./ConfigPanel";

interface HeaderProps {
  lastUpdated?: Date | null;
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
    <header
      className={css({
        bg: "bg.card",
        borderBottom: "1px solid",
        borderColor: "border",
        boxShadow: "sm",
      })}
    >
      {/* メインヘッダー行 */}
      <div
        className={css({
          px: 6,
          py: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <div>
          <h1
            className={css({
              fontSize: "xl",
              fontWeight: "700",
              color: "text",
              fontFamily: "heading",
              letterSpacing: "tight",
            })}
          >
            🐾 {config.siteName}
          </h1>
          {lastUpdated && (
            <p className={css({ fontSize: "xs", color: "text.muted", mt: "1px" })}>
              最終更新: {lastUpdated.toLocaleString("ja-JP")}
            </p>
          )}
        </div>

        <div className={css({ display: "flex", alignItems: "center", gap: 3 })}>
          <span
            className={cx(
              css({ display: { base: "none", md: "inline" } }),
              css({ fontSize: "xs", color: "text.muted" })
            )}
          >
            {config.refreshInterval / 1000}秒ごとに更新
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* 設定パネル */}
      <ConfigPanel />
    </header>
  );
}

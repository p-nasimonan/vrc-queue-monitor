"use client";

import { css, cx } from "../../styled-system/css";
import { ThemeToggle } from "./ThemeToggle";
import { config } from "@/lib/config";
import { ConfigPanel } from "./ConfigPanel";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
  lastUpdated?: Date | null;
  siteName: string;
}

export function Header({ lastUpdated, siteName }: HeaderProps) {
  const pathname = usePathname();

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
        <div className={css({ display: "flex", alignItems: "center", gap: 6 })}>
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
              🐾 {siteName}
            </h1>
            {lastUpdated && (
              <p className={css({ fontSize: "xs", color: "text.muted", mt: "1px" })}>
                最終更新: {lastUpdated.toLocaleString("ja-JP")}
              </p>
            )}
          </div>

          <nav className={css({ display: "flex", gap: 4, ml: 4 })}>
            <Link 
              href="/" 
              className={css({
                fontSize: "sm",
                fontWeight: "600",
                color: pathname === "/" ? "accent" : "text.muted",
                borderBottom: pathname === "/" ? "2px solid" : "2px solid transparent",
                borderColor: pathname === "/" ? "accent" : "transparent",
                pb: 1,
                transition: "all 0.2s",
                _hover: { color: "text" },
              })}
            >
              グラフ表示
            </Link>
            <Link 
              href="/table" 
              className={css({
                fontSize: "sm",
                fontWeight: "600",
                color: pathname === "/table" ? "accent" : "text.muted",
                borderBottom: pathname === "/table" ? "2px solid" : "2px solid transparent",
                borderColor: pathname === "/table" ? "accent" : "transparent",
                pb: 1,
                transition: "all 0.2s",
                _hover: { color: "text" },
              })}
            >
              表表示
            </Link>
          </nav>
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
          <a
            href="https://github.com/p-nasimonan/vrc-queue-monitor"
            target="_blank"
            rel="noopener noreferrer"
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.muted",
              _hover: { color: "text" },
              transition: "colors",
            })}
            title="GitHub Repository"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
          </a>
          <ThemeToggle />
        </div>
      </div>

      {/* 設定パネル */}
      <ConfigPanel />
    </header>
  );
}

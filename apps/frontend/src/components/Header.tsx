"use client";

import { css } from "../../styled-system/css";
import { ThemeToggle } from "./ThemeToggle";
import { config } from "@/lib/config";
import { badgeRecipe } from "@/styles/recipes";

interface HeaderProps {
  lastUpdated?: Date;
}

export function Header({ lastUpdated }: HeaderProps) {
  return (
    <header
      className={css({
        py: 4,
        px: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "2px solid",
        borderColor: "border",
        bg: "bg.card",
        boxShadow: "sm",
      })}
    >
      <div>
        <h1
          className={css({
            fontSize: "3xl",
            fontWeight: "bold",
            color: "text",
            fontFamily: "heading",
            letterSpacing: "tight",
          })}
        >
          {config.siteName}
        </h1>
        {lastUpdated && (
          <p className={css({ fontSize: "xs", color: "text.muted", mt: 1, display: "flex", alignItems: "center", gap: 2 })}>
            <span>最終更新: {lastUpdated.toLocaleString("ja-JP")}</span>
          </p>
        )}
      </div>

      <div className={css({ display: "flex", alignItems: "center", gap: 3 })}>
        <span
          className={badgeRecipe({ variant: "muted" }) + " " + css({ display: { base: "none", md: "inline-flex" } })}
        >
          {config.refreshInterval / 1000}秒ごとに自動更新
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}

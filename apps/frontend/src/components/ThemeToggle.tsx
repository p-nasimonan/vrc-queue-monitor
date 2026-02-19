"use client";

import { useEffect, useState } from "react";
import { css } from "../../styled-system/css";
import { buttonRecipe } from "@/styles/recipes";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  if (!mounted) {
    return (
      <div
        className={css({
          w: "40px",
          h: "40px",
        })}
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label="テーマ切り替え"
      className={css({
        p: 2,
        borderRadius: "full",
        bg: "bg.card",
        border: "2px solid",
        borderColor: "border",
        cursor: "pointer",
        transition: "all 0.2s",
        fontSize: "xl",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        _hover: {
          bg: "bg.hover",
          transform: "scale(1.05)",
          borderColor: "accent",
        },
      })}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

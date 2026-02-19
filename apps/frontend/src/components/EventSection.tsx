"use client";

import { useState } from "react";
import { css } from "../../styled-system/css";
import type { EventGroup } from "@/lib/api";
import { InstanceCard } from "./InstanceCard";
import { cardRecipe, badgeRecipe } from "@/styles/recipes";

interface EventSectionProps {
  event: EventGroup;
  defaultOpen?: boolean;
  isLive?: boolean;
}

export function EventSection({ event, defaultOpen = false, isLive = false }: EventSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    };
    return date.toLocaleDateString("ja-JP", options);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalUsers = event.instances.reduce((sum, inst) => {
    const latest = inst.metrics[inst.metrics.length - 1];
    return sum + (latest?.current_users || 0);
  }, 0);

  const totalQueue = event.instances.reduce((sum, inst) => {
    const latest = inst.metrics[inst.metrics.length - 1];
    return sum + (latest?.queue_size || 0);
  }, 0);

  return (
    <section
      className={css({
        bg: "bg.card",
        borderRadius: "xl",
        overflow: "hidden",
        boxShadow: "md",
        border: "2px solid",
        borderColor: "border",
        mb: 4,
        transition: "all 0.2s",
        _hover: {
          boxShadow: "lg",
        },
      })}
    >
      {/* ヘッダー（折りたたみトグル） */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={css({
          w: "100%",
          p: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          transition: "background 0.2s",
          bg: "bg.card",
          _hover: { bg: "bg.hover" },
        })}
      >
        <div className={css({ display: "flex", alignItems: "center", gap: 3 })}>
          {/* 矢印アイコン */}
          <span
            className={css({
              transition: "transform 0.2s",
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              fontSize: "lg",
              color: "accent",
            })}
          >
            ▶
          </span>

          {/* 日付 */}
          <h2
            className={css({
              fontSize: "2xl",
              fontWeight: "bold",
              color: "text",
              fontFamily: "heading",
            })}
          >
            {formatDate(event.eventDate)}
          </h2>

          {/* 時間範囲 */}
          <span className={badgeRecipe({ variant: "muted" })}>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </span>
        </div>

        {/* 統計 */}
        <div className={css({ display: "flex", gap: 4, alignItems: "center" })}>
          <div className={css({ textAlign: "right" })}>
            <span className={css({ color: "text.muted", fontSize: "xs", display: "block", mb: 1 })}>
              インスタンス数
            </span>
            <p className={css({ fontSize: "xl", fontWeight: "bold", color: "text" })}>
              {event.instances.length}
            </p>
          </div>
          {isLive && (
            <>
              <div className={css({ textAlign: "right" })}>
                <span className={css({ color: "text.muted", fontSize: "xs", display: "block", mb: 1 })}>
                  合計参加中
                </span>
                <p className={css({ fontSize: "xl", fontWeight: "bold", color: "accent" })}>
                  {totalUsers}
                </p>
              </div>
              <div className={css({ textAlign: "right" })}>
                <span className={css({ color: "text.muted", fontSize: "xs", display: "block", mb: 1 })}>
                  合計待機列
                </span>
                <span className={badgeRecipe({ variant: totalQueue > 0 ? "warning" : "success" })}>
                  {totalQueue}
                </span>
              </div>
            </>
          )}
        </div>
      </button>

      {/* コンテンツ */}
      {isOpen && (
        <div
          className={css({
            p: 4,
            pt: 0,
            display: "grid",
            gridTemplateColumns: {
              base: "1fr",
              md: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },
            gap: 4,
          })}
        >
          {event.instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} isLive={isLive} />
          ))}
        </div>
      )}
    </section>
  );
}

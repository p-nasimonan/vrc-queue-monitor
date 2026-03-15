"use client";

import { useState } from "react";
import { css } from "../../styled-system/css";
import type { EventGroup } from "@/lib/api";
import { InstanceCard } from "./InstanceCard";
import { badgeRecipe } from "@/styles/recipes";

interface EventSectionProps {
  event: EventGroup;
  defaultOpen?: boolean;
  isLive?: boolean;
}

export function EventSection({ event, defaultOpen = false, isLive = false }: EventSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Tokyo",
    });
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    });

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
        _hover: { boxShadow: "lg" },
      })}
    >
      <div
        className={css({
          bg: "bg.card",
          borderBottom: isOpen ? "1px solid" : "none",
          borderColor: "border",
        })}
      >
        <div
          className={css({
            w: "100%",
            p: 5,
            display: "flex",
            flexDirection: { base: "column", sm: "row" },
            alignItems: { base: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 4,
          })}
        >
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
              textAlign: "left",
              _hover: { opacity: 0.8 },
            })}
          >
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
            <div className={css({ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" })}>
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
              <span className={badgeRecipe({ variant: "muted" })}>
                {formatTime(event.startTime)} - {formatTime(event.endTime)}
              </span>
            </div>
          </button>

          <div className={css({ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" })}>
            <div className={css({ textAlign: "right", ml: { base: 0, sm: 2 } })}>
              <span className={css({ color: "text.muted", fontSize: "xs", display: "block", mb: 1 })}>
                インスタンス数
              </span>
              <p className={css({ fontSize: "xl", fontWeight: "bold", color: "text", lineHeight: 1 })}>
                {event.instances.length}
              </p>
            </div>
            {isLive && (
              <>
                <div className={css({ textAlign: "right" })}>
                  <span className={css({ color: "text.muted", fontSize: "xs", display: "block", mb: 1 })}>
                    合計参加中
                  </span>
                  <p className={css({ fontSize: "xl", fontWeight: "bold", color: "accent", lineHeight: 1 })}>
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
        </div>
      </div>

      {isOpen && (
        <div
          className={css({
            p: 4,
            display: "flex",
            flexDirection: "column",
            gap: 3,
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

"use client";

import Link from "next/link";
import Image from "next/image";
import { css } from "../../styled-system/css";
import type { InstanceWithMetrics } from "@/lib/api";
import { QueueChart } from "./QueueChart";
import { getCapacityColor } from "@/styles/utils";

interface InstanceCardProps {
  instance: InstanceWithMetrics;
  isLive?: boolean;
}

/** display_name から インスタンスリーダーを抽出 */
function extractLeader(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  // "vrchatid's Instance" → "vrchatid"
  const apostropheMatch = displayName.match(/^(.+?)(?:'s|'s)\s+[Ii]nstance/u);
  if (apostropheMatch) return apostropheMatch[1];
  // "vrchatid のインスタンス" → "vrchatid"
  const noMatch = displayName.match(/^(.+?)\s*の[インスタンス]/u);
  if (noMatch) return noMatch[1];
  return null;
}

export function InstanceCard({ instance, isLive = false }: InstanceCardProps) {
  const latestMetric = instance.metrics[instance.metrics.length - 1];
  const currentUsers = latestMetric?.current_users ?? 0;
  const queueSize = latestMetric?.queue_size ?? 0;
  const pcUsers = latestMetric?.pc_users;
  const capacityColor = instance.capacity > 0 ? getCapacityColor(currentUsers, instance.capacity) : "text";
  const leader = extractLeader(instance.display_name);

  return (
    <div
      className={css({
        bg: "bg.card",
        borderRadius: "lg",
        border: "1px solid",
        borderColor: "border",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
        _hover: { boxShadow: "md" },
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      })}
    >
      {/* サムネイル */}
      <div
        style={{
          position: "relative",
          width: "200px",
          height: "150px",
          flexShrink: 0,
          backgroundColor: "var(--colors-bg-subtle, #f5f0e8)",
        }}
      >
        {instance.world_thumbnail_url && (
          <Image
            src={instance.world_thumbnail_url}
            alt={instance.world_name}
            fill
            style={{ objectFit: "contain" }}
            unoptimized
          />
        )}
        {instance.region && (
          <span
            style={{
              position: "absolute",
              bottom: 3,
              right: 3,
              background: "rgba(0,0,0,0.6)",
              color: "white",
              fontSize: "9px",
              fontWeight: 600,
              padding: "1px 4px",
              borderRadius: 3,
              textTransform: "uppercase",
            }}
          >
            {instance.region}
          </span>
        )}
      </div>

      {/* 情報パネル */}
      <div
        className={css({
          width: "200px",
          flexShrink: 0,
          p: 3,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          borderRight: "1px solid",
          borderColor: "border",
          justifyContent: "center",
        })}
      >
        {/* タイトル */}
        {instance.display_name ? (
          <>
            <p
              className={css({
                fontSize: "sm",
                fontWeight: "700",
                color: "text",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              })}
            >
              {instance.display_name}
            </p>
            <p
              className={css({
                fontSize: "xs",
                color: "text.muted",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              })}
            >
              {instance.world_name}
            </p>
          </>
        ) : (
          <p
            className={css({
              fontSize: "sm",
              fontWeight: "700",
              color: "text",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {instance.world_name}
          </p>
        )}

        {/* インスタンスリーダー */}
        {leader && (
          <p
            className={css({
              fontSize: "xs",
              color: "text.muted",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              mt: "1px",
            })}
          >
            👑 {leader}
          </p>
        )}

        {/* 参加中 / 待機列 (イベント中のみ) */}
        {isLive && (
          <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, mt: 1 })}>
            <span
              className={css({
                fontSize: "lg",
                fontWeight: "700",
                color: capacityColor,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              })}
            >
              {currentUsers}
              {instance.capacity > 0 && (
                <span className={css({ fontSize: "xs", color: "text.muted", fontWeight: "400" })}>
                  /{instance.capacity}人
                </span>
              )}
            </span>
            {queueSize > 0 && (
              <span
                className={css({
                  px: 2,
                  py: "2px",
                  borderRadius: "full",
                  fontSize: "xs",
                  fontWeight: "700",
                  bg: "vrc.warning",
                  color: "white",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                待機{queueSize}人
              </span>
            )}
            {pcUsers != null && (
              <span className={css({ fontSize: "xs", color: "text.muted" })}>PC:{pcUsers}</span>
            )}
          </div>
        )}

        <Link
          href={`/instance/${instance.id}`}
          className={css({
            fontSize: "xs",
            color: "accent",
            fontWeight: "600",
            _hover: { textDecoration: "underline" },
            mt: "auto",
            pt: 1,
          })}
        >
          詳細→
        </Link>
      </div>

      {/* チャート */}
      <div className={css({ flex: 1, minW: 0, p: 2 })}>
        <QueueChart metrics={instance.metrics} capacity={instance.capacity} height={150} />
      </div>
    </div>
  );
}

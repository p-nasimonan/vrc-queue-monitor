"use client";

import { css } from "../../styled-system/css";
import type { InstanceWithMetrics } from "@/lib/api";
import { QueueChart } from "./QueueChart";
import { getInstanceStatus, getCapacityColor, getQueueStatusColor } from "@/styles/utils";

interface InstanceCardProps {
  instance: InstanceWithMetrics;
  isLive?: boolean;
}

export function InstanceCard({ instance, isLive = false }: InstanceCardProps) {
  const latestMetric = instance.metrics[instance.metrics.length - 1];
  const currentUsers = latestMetric?.current_users ?? 0;
  const queueSize = latestMetric?.queue_size ?? 0;
  const status = getInstanceStatus(currentUsers, instance.capacity, queueSize);

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
      })}
    >
      {/* ヘッダー：インスタンス名 + コンパクト数値 */}
      <div
        className={css({
          px: 3,
          pt: 3,
          pb: 2,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        })}
      >
        <div className={css({ minW: 0 })}>
          <h3
            className={css({
              fontSize: "sm",
              fontWeight: "700",
              color: "text",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {instance.name}
          </h3>
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
        </div>

        {/* コンパクト数値バッジ（LIVE時のみ） */}
        {isLive && (
          <div className={css({ display: "flex", gap: 2, flexShrink: 0, alignItems: "center" })}>
            {/* ステータス文字 */}
            <span
              className={css({
                fontSize: "xs",
                color: "text.muted",
                display: { base: "none", sm: "inline" },
              })}
            >
              {status}
            </span>
            {/* 参加数 / 定員 */}
            <span
              className={css({
                fontSize: "sm",
                fontWeight: "700",
                color: getCapacityColor(currentUsers, instance.capacity),
                fontVariantNumeric: "tabular-nums",
              })}
            >
              {currentUsers}
              <span className={css({ fontSize: "xs", color: "text.muted", fontWeight: "400" })}>
                /{instance.capacity}
              </span>
            </span>
            {/* 待機列（あるときのみ表示） */}
            {queueSize > 0 && (
              <span
                className={css({
                  px: 2,
                  py: "1px",
                  borderRadius: "full",
                  fontSize: "xs",
                  fontWeight: "700",
                  bg: "vrc.warning",
                  color: "white",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                待{queueSize}
              </span>
            )}
          </div>
        )}
      </div>

      {/* グラフ（メイン） */}
      <QueueChart metrics={instance.metrics} capacity={instance.capacity} />
    </div>
  );
}

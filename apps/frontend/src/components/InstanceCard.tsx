"use client";

import { css, cx } from "../../styled-system/css";
import type { InstanceWithMetrics } from "@/lib/api";
import { QueueChart } from "./QueueChart";
import { cardRecipe, statCardRecipe, badgeRecipe } from "@/styles/recipes";
import { getInstanceStatus, getCapacityColor, getQueueStatusColor } from "@/styles/utils";

interface InstanceCardProps {
  instance: InstanceWithMetrics;
  isLive?: boolean;
}

export function InstanceCard({ instance, isLive = false }: InstanceCardProps) {
  const latestMetric = instance.metrics[instance.metrics.length - 1];
  const currentUsers = latestMetric?.current_users || 0;
  const queueSize = latestMetric?.queue_size || 0;
  const status = getInstanceStatus(currentUsers, instance.capacity, queueSize);

  return (
    <div className={cardRecipe({ variant: "elevated" })}>
      {/* ヘッダー */}
      <div className={css({ mb: 3 })}>
        <div className={css({ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 })}>
          <h3
            className={css({
              fontSize: "lg",
              fontWeight: "bold",
              color: "text",
            })}
          >
            {instance.name}
          </h3>
          {isLive && (
            <span className={badgeRecipe({
              variant: queueSize > 0 ? "warning" : currentUsers >= instance.capacity * 0.8 ? "primary" : "success"
            })}>
              {status}
            </span>
          )}
        </div>
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

      {/* 現在の状態（進行中のみ） */}
      {isLive && (
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 3,
            mb: 4,
          })}
        >
          <div className={statCardRecipe({ highlight: currentUsers >= instance.capacity })}>
            <p className={css({ fontSize: "xs", color: "text.muted", mb: 1 })}>参加中</p>
            <p className={css({ fontSize: "2xl", fontWeight: "bold", color: getCapacityColor(currentUsers, instance.capacity) })}>
              {currentUsers}
              <span className={css({ fontSize: "sm", color: "text.muted", ml: 1 })}>/ {instance.capacity}</span>
            </p>
          </div>
          <div className={statCardRecipe({ highlight: queueSize > 0 })}>
            <p className={css({ fontSize: "xs", color: "text.muted", mb: 1 })}>待機列</p>
            <p className={css({ fontSize: "2xl", fontWeight: "bold", color: getQueueStatusColor(queueSize, instance.capacity) })}>
              {queueSize}
            </p>
          </div>
        </div>
      )}

      {/* グラフ */}
      <QueueChart metrics={instance.metrics} capacity={instance.capacity} />
    </div>
  );
}

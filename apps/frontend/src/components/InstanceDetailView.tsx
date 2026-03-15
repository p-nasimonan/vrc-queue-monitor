"use client";

import Link from "next/link";
import Image from "next/image";
import { css } from "../../styled-system/css";
import type { Instance, Metric } from "@/lib/api";
import { QueueChart } from "./QueueChart";
import { config } from "@/lib/config";

interface InstanceDetailViewProps {
  instance: Instance;
  metrics: Metric[];
}

export function InstanceDetailView({ instance, metrics }: InstanceDetailViewProps) {
  const latestMetric = metrics[metrics.length - 1];
  const currentUsers = latestMetric?.current_users ?? 0;
  const queueSize = latestMetric?.queue_size ?? 0;
  const pcUsers = latestMetric?.pc_users;

  const formatTs = (ts: string) =>
    new Date(ts).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: config.timezone,
    });

  return (
    <div className={css({ minH: "100vh", bg: "bg", pb: { base: 20, md: 4 } })}>
      {/* ヘッダー */}
      <div
        className={css({
          bg: "bg.card",
          borderBottom: "1px solid",
          borderColor: "border",
          px: 4,
          py: 3,
          display: "flex",
          alignItems: "center",
          gap: 3,
        })}
      >
        <Link
          href="/"
          className={css({
            fontSize: "sm",
            color: "accent",
            fontWeight: "600",
            _hover: { textDecoration: "underline" },
          })}
        >
          ← 戻る
        </Link>
        <span className={css({ color: "border" })}>|</span>
        <h1 className={css({ fontSize: "lg", fontWeight: "700", color: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
          {instance.display_name || instance.world_name}
        </h1>
      </div>

      <main className={css({ maxW: "1200px", mx: "auto", px: 4, py: 6 })}>
        {/* インスタンス情報 */}
        <div
          className={css({
            bg: "bg.card",
            borderRadius: "xl",
            border: "1px solid",
            borderColor: "border",
            overflow: "hidden",
            mb: 4,
          })}
        >
          {/* サムネイル */}
          {instance.world_thumbnail_url && (
            <div className={css({ position: "relative", width: "100%", aspectRatio: "16/9", bg: "bg.subtle" })}>
              <Image
                src={instance.world_thumbnail_url}
                alt={instance.world_name}
                fill
                style={{ objectFit: "contain" }}
                unoptimized
              />
            </div>
          )}

          <div className={css({ p: 4, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "flex-start" })}>
            <div className={css({ flex: 1, minW: "200px" })}>
              {instance.display_name && (
                <h2 className={css({ fontSize: "xl", fontWeight: "700", color: "text", mb: 1 })}>
                  {instance.display_name}
                </h2>
              )}
              <p className={css({ fontSize: "sm", color: "text.muted" })}>{instance.world_name}</p>
              {instance.region && (
                <span className={css({ fontSize: "xs", color: "text.muted", mt: 1, display: "inline-block" })}>
                  {instance.region.toUpperCase()}
                </span>
              )}
            </div>

            {/* 最新メトリクス */}
            <div className={css({ display: "flex", gap: 4, flexWrap: "wrap" })}>
              <div className={css({ textAlign: "center" })}>
                <p className={css({ fontSize: "2xl", fontWeight: "700", color: "accent", lineHeight: 1 })}>
                  {currentUsers}
                  {instance.capacity > 0 && (
                    <span className={css({ fontSize: "sm", color: "text.muted", fontWeight: "400" })}>
                      /{instance.capacity}
                    </span>
                  )}
                </p>
                <p className={css({ fontSize: "xs", color: "text.muted", mt: 1 })}>参加中</p>
              </div>
              {queueSize > 0 && (
                <div className={css({ textAlign: "center" })}>
                  <p className={css({ fontSize: "2xl", fontWeight: "700", color: "vrc.warning", lineHeight: 1 })}>
                    {queueSize}
                  </p>
                  <p className={css({ fontSize: "xs", color: "text.muted", mt: 1 })}>待機列</p>
                </div>
              )}
              {pcUsers != null && (
                <div className={css({ textAlign: "center" })}>
                  <p className={css({ fontSize: "2xl", fontWeight: "700", color: "text", lineHeight: 1 })}>
                    {pcUsers}
                  </p>
                  <p className={css({ fontSize: "xs", color: "text.muted", mt: 1 })}>PC</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* チャート */}
        <div
          className={css({
            bg: "bg.card",
            borderRadius: "xl",
            border: "1px solid",
            borderColor: "border",
            p: 4,
          })}
        >
          <div className={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 })}>
            <h3 className={css({ fontSize: "md", fontWeight: "700", color: "text" })}>履歴チャート</h3>
            {metrics.length > 0 && (
              <span className={css({ fontSize: "xs", color: "text.muted" })}>
                {formatTs(metrics[0].timestamp)} 〜 {formatTs(metrics[metrics.length - 1].timestamp)}
              </span>
            )}
          </div>
          <QueueChart metrics={metrics} capacity={instance.capacity} height={400} />
        </div>

        <p className={css({ fontSize: "xs", color: "text.muted", mt: 3, textAlign: "right" })}>
          {metrics.length} データポイント
        </p>
      </main>

    </div>
  );
}

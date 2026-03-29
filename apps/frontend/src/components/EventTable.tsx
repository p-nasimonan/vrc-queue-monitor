"use client";

import React, { useEffect, useState, useCallback } from "react";
import { css } from "../../styled-system/css";
import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { Header } from "./Header";
import { config } from "@/lib/config";

interface EventTableProps {
  initialEvents: EventGroup[];
  siteName: string;
}

export function EventTable({ initialEvents, siteName }: EventTableProps) {
  const [events, setEvents] = useState(initialEvents);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchEventGroups(config.displayDays);
      setEvents(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshEvents, config.refreshInterval);
    return () => clearInterval(interval);
  }, [refreshEvents]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
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

  // ========== 計算ロジックの共通化とパフォーマンス最適化 (useMemo) ==========
  // 画面描画用とCSV出力用の計算を1つにまとめ、不要な再計算を防ぐ
  const tableRows = React.useMemo(() => {
    return events.flatMap((event) => {
      const eDate = formatDate(event.eventDate);
      const eStart = formatTime(event.startTime);
      const eEnd = formatTime(event.endTime);
      const eTime = `${eStart} - ${eEnd}`;

      return event.instances.map((inst, i) => {
        let maxCurrent = 0;
        let maxQueue = 0;
        let maxTotal = 0;

        inst.metrics.forEach((m) => {
          if (m.current_users > maxCurrent) maxCurrent = m.current_users;
          if (m.queue_size > maxQueue) maxQueue = m.queue_size;
          const total = m.current_users + m.queue_size;
          if (total > maxTotal) maxTotal = total;
        });

        const instName = inst.display_name ? `${inst.display_name} (${inst.name})` : inst.name;
        
        return {
          id: inst.id,
          eventId: event.eventDate,
          isFirstInEvent: i === 0,
          eDate,
          eStart,
          eEnd,
          eTime,
          instName,
          capacity: inst.capacity,
          maxCurrent,
          maxQueue,
          maxTotal,
        };
      });
    });
  }, [events]);

  // ========== CSVエクスポート処理 ==========
  const handleExportCSV = () => {
    const headers = [
      "イベント日",
      "開始時間",
      "終了時間",
      "インスタンス名",
      "定員",
      "最高参加人数",
      "最高待機列",
      "最大合計接続",
    ];

    const csvRows = tableRows.map((row) => {
      return [
        `"${row.eDate}"`,
        `"${row.eStart}"`,
        `"${row.eEnd}"`,
        `"${row.instName.replace(/"/g, '""')}"`,
        row.capacity,
        row.maxCurrent,
        row.maxQueue,
        row.maxTotal,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `vrc_queue_export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={css({ minH: "100vh", bg: "bg" })}>
      <Header lastUpdated={lastUpdated} siteName={siteName} />

      <main className={css({ maxW: "1200px", mx: "auto", px: 4, py: 6 })}>
        <div className={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 6 })}>
          <h2 className={css({ fontSize: "2xl", fontWeight: "bold", color: "text" })}>イベント一覧 (表形式)</h2>
          <button
            onClick={handleExportCSV}
            className={css({
              bg: "accent",
              color: "white",
              px: 4,
              py: 2,
              borderRadius: "md",
              fontWeight: "600",
              fontSize: "sm",
              cursor: "pointer",
              transition: "background 0.2s",
              _hover: { bg: "accent.hover", opacity: 0.9 },
            })}
          >
            CSVをダウンロード
          </button>
        </div>

        {isLoading && (
          <div className={css({ position: "fixed", top: 3, right: 3, bg: "accent", color: "white", px: 3, py: 1, borderRadius: "full", fontSize: "xs", zIndex: 50 })}>
            更新中...
          </div>
        )}

        {events.length === 0 ? (
          <div className={css({ textAlign: "center", py: 20, color: "text.muted" })}>
            <p className={css({ fontSize: "xl", mb: 2 })}>データがありません</p>
          </div>
        ) : (
          <div className={css({ overflowX: "auto", bg: "bg.card", borderRadius: "lg", border: "1px solid", borderColor: "border", boxShadow: "sm" })}>
            <table className={css({ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "sm" })}>
              <thead>
                <tr className={css({ bg: "bg.subtle", borderBottom: "2px solid", borderColor: "border" })}>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>イベント日</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>時間</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>インスタンス名</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>定員</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>最高参加人数</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>最高待機列</th>
                  <th className={css({ p: 3, color: "text.muted", fontWeight: "600" })}>最大合計接続</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr 
                    key={row.id} 
                    className={css({ 
                      borderBottom: "1px solid", 
                      borderColor: "border",
                      _hover: { bg: "bg.subtle" } 
                    })}
                  >
                    <td className={css({ p: 3, fontWeight: row.isFirstInEvent ? "600" : "normal", color: "text" })}>
                      {row.isFirstInEvent ? row.eDate : ""}
                    </td>
                    <td className={css({ p: 3, color: "text" })}>
                      {row.isFirstInEvent ? row.eTime : ""}
                    </td>
                    <td className={css({ p: 3, color: "text", fontWeight: "500" })}>
                      {row.instName}
                    </td>
                    <td className={css({ p: 3, color: "text" })}>{row.capacity}</td>
                    <td className={css({ p: 3, color: "text", fontWeight: "bold" })}>{row.maxCurrent}</td>
                    <td className={css({ p: 3, color: row.maxQueue > 0 ? "vrc.warning" : "text", fontWeight: "bold" })}>{row.maxQueue}</td>
                    <td className={css({ p: 3, color: "accent", fontWeight: "bold" })}>{row.maxTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

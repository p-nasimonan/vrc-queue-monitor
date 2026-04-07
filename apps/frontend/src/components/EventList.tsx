"use client";

import { useEffect, useState, useCallback } from "react";
import { css } from "../../styled-system/css";
import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventSection } from "./EventSection";
import { Header } from "./Header";
import { ChartControls } from "./ChartControls";
import { config } from "@/lib/config";

interface EventListProps {
  initialEvents: EventGroup[];
  siteName: string;
}

export function EventList({ initialEvents, siteName }: EventListProps) {
  const [events, setEvents] = useState(initialEvents);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    setLastUpdated(new Date());
    setNow(new Date());
  }, []);

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchEventGroups(config.displayDays);
      setEvents(data);
      setLastUpdated(new Date());
      setNow(new Date());
      setApiError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "バックエンドに接続できません";
      setApiError(msg);
      console.error("Failed to fetch events:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshEvents, config.refreshInterval);
    return () => clearInterval(interval);
  }, [refreshEvents]);

  // nowがnull（SSR）の場合はイベント展開のみ行う
  return (
    <div className={css({ minH: "100vh", bg: "bg" })}>
      <Header lastUpdated={lastUpdated} siteName={siteName} />
      <ChartControls />

      {/* モバイルの固定ボトムバー分パディング */}
      <main className={css({ maxW: "1400px", mx: "auto", px: 4, py: 4, pb: { base: 20, md: 4 } })}>
      {/* ローディングインジケーター */}
        {isLoading && (
          <div
            className={css({
              position: "fixed",
              top: 3,
              right: 3,
              bg: "accent",
              color: "white",
              px: 3,
              py: 1,
              borderRadius: "full",
              fontSize: "xs",
              zIndex: 50,
            })}
          >
            更新中...
          </div>
        )}

        {/* バックエンド接続エラー警告 */}
        {apiError && (
          <div
            className={css({
              mb: 4,
              p: 3,
              bg: "vrc.error",
              color: "white",
              borderRadius: "md",
              fontSize: "sm",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 3,
            })}
          >
            <span>
              ⚠️ {apiError}
            </span>
            <button
              onClick={() => refreshEvents()}
              className={css({
                px: 3,
                py: 1,
                bg: "white",
                color: "vrc.error",
                borderRadius: "sm",
                fontSize: "xs",
                fontWeight: "700",
                cursor: "pointer",
                _hover: { opacity: 0.8 },
              })}
            >
              再試行
            </button>
          </div>
        )}

        {/* イベント一覧 */}
        {events.length === 0 ? (
          <div
            className={css({
              textAlign: "center",
              py: 20,
              color: "text.muted",
            })}
          >
            <p className={css({ fontSize: "xl", mb: 2 })}>データがありません</p>
            <p className={css({ fontSize: "sm" })}>
              イベントが開始されるとここに表示されます
            </p>
          </div>
        ) : (
          <div className={css({ display: "flex", flexDirection: "column", gap: 3 })}>
            {events.map((event, index) => {
              const start = new Date(event.startTime);
              const end = new Date(event.endTime);
              const isLive = now ? now >= start && now <= end : false;

              return (
                <div key={event.eventDate} className={css({ position: "relative" })}>
                  {isLive && (
                    <div className={css({ display: "flex", alignItems: "center", gap: 2, mb: 3 })}>
                      <span
                        className={css({
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 1,
                          px: 2,
                          py: "2px",
                          borderRadius: "full",
                          fontSize: "xs",
                          fontWeight: "700",
                          bg: "vrc.success",
                          color: "white",
                        })}
                      >
                        <span
                          className={css({
                            w: "5px",
                            h: "5px",
                            borderRadius: "full",
                            bg: "white",
                            display: "inline-block",
                          })}
                        />
                        LIVE
                      </span>
                    </div>
                  )}
                  <EventSection 
                    event={event} 
                    defaultOpen={index === 0} 
                    isLive={isLive} 
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

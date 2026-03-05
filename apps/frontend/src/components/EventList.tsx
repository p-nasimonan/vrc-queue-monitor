"use client";

import { useEffect, useState, useCallback } from "react";
import { css } from "../../styled-system/css";
import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventSection } from "./EventSection";
import { Header } from "./Header";
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

  // nowがnull（SSR）の場合は何もレンダリングしない
  const liveEvents = now
    ? events.filter((e) => {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      return now >= start && now <= end;
    })
    : [];
  const pastEvents = now
    ? events.filter((e) => now > new Date(e.endTime))
    : [];

  return (
    <div className={css({ minH: "100vh", bg: "bg" })}>
      <Header lastUpdated={lastUpdated} siteName={siteName} />

      <main className={css({ maxW: "1400px", mx: "auto", px: 4, py: 4 })}>
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
          <>
            {/* 進行中 */}
            {liveEvents.length > 0 && (
              <div className={css({ mb: 6 })}>
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
                  <h2 className={css({ fontSize: "lg", fontWeight: "700", color: "text" })}>
                    進行中のイベント
                  </h2>
                </div>
                {liveEvents.map((event) => (
                  <EventSection key={event.eventDate} event={event} defaultOpen isLive />
                ))}
              </div>
            )}

            {/* 過去のイベント */}
            {pastEvents.length > 0 && (
              <div>
                <h2 className={css({ fontSize: "lg", fontWeight: "700", color: "text", mb: 3 })}>
                  過去のイベント
                </h2>
                {pastEvents.map((event, index) => (
                  <EventSection
                    key={event.eventDate}
                    event={event}
                    defaultOpen={index === 0 && liveEvents.length === 0}
                    isLive={false}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

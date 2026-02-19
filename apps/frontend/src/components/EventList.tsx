"use client";

import { useEffect, useState, useCallback } from "react";
import { css } from "../../styled-system/css";
import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventSection } from "./EventSection";
import { Header } from "./Header";
import { config } from "@/lib/config";

interface EventListProps {
  initialEvents: EventGroup[];
}

export function EventList({ initialEvents }: EventListProps) {
  const [events, setEvents] = useState(initialEvents);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className={css({ minH: "100vh", bg: "bg" })}>
      <Header lastUpdated={lastUpdated} />

      <main className={css({ maxW: "1400px", mx: "auto", p: 6 })}>
        {/* ローディングインジケーター */}
        {isLoading && (
          <div
            className={css({
              position: "fixed",
              top: 4,
              right: 4,
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
            <p className={css({ fontSize: "xl", mb: 2 })}>
              データがありません
            </p>
            <p className={css({ fontSize: "sm" })}>
              イベントが開始されるとここに表示されます
            </p>
          </div>
        ) : (() => {
          const now = new Date();
          const liveEvents = events.filter((e) => {
            const start = new Date(e.startTime);
            const end = new Date(e.endTime);
            return now >= start && now <= end;
          });
          const pastEvents = events.filter((e) => {
            const end = new Date(e.endTime);
            return now > end;
          });

          return (
            <>
              {/* 進行中 */}
              {liveEvents.length > 0 && (
                <div className={css({ mb: 8 })}>
                  <div className={css({ display: "flex", alignItems: "center", gap: 3, mb: 4 })}>
                    <span className={css({
                      display: "inline-flex", alignItems: "center", gap: 1,
                      px: 3, py: 1, borderRadius: "full", fontSize: "sm", fontWeight: "bold",
                      bg: "vrc.success", color: "white",
                    })}>
                      <span className={css({ w: "6px", h: "6px", borderRadius: "full", bg: "white", display: "inline-block", animation: "pulse 1.5s infinite" })} />
                      LIVE
                    </span>
                    <h2 className={css({ fontSize: "xl", fontWeight: "bold", color: "text" })}>進行中のイベント</h2>
                  </div>
                  {liveEvents.map((event) => (
                    <EventSection key={event.eventDate} event={event} defaultOpen isLive />
                  ))}
                </div>
              )}

              {/* 過去のイベント */}
              {pastEvents.length > 0 && (
                <div>
                  <h2 className={css({ fontSize: "xl", fontWeight: "bold", color: "text", mb: 4 })}>過去のイベント</h2>
                  {pastEvents.map((event, index) => (
                    <EventSection key={event.eventDate} event={event} defaultOpen={index === 0 && liveEvents.length === 0} isLive={false} />
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </main>
    </div>
  );
}

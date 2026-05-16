import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { db } from "./db/index";
import { instances, metrics } from "./db/schema";
import { ScheduleConfig } from "./scheduler";

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",");
app.use("*", cors({ origin: corsOrigins, credentials: true }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeMetric(
  nUsers: number,
  queueSize: number,
  capacity: number,
  legacyCurrentUsers: number,
): { currentUsers: number; effectiveQueue: number } {
  if (nUsers === 0 && legacyCurrentUsers > 0) {
    return { currentUsers: legacyCurrentUsers, effectiveQueue: queueSize };
  }
  if (capacity > 0 && nUsers > capacity) {
    return { currentUsers: capacity, effectiveQueue: nUsers - capacity };
  }
  return { currentUsers: nUsers, effectiveQueue: queueSize };
}

function eventDateJst(createdAt: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(createdAt);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (c) =>
  c.json({ status: "ok", message: "VRC Queue Monitor API is running", version: "1.0.0" })
);

app.get("/api/config", (c) => {
  const schedule = new ScheduleConfig();
  const nextStart = schedule.getNextStart();
  return c.json({
    schedule_type: schedule.scheduleType,
    schedule_days: schedule.scheduleDays,
    start_time: schedule.startTimeStr,
    duration_minutes: schedule.durationMinutes,
    poll_interval_minutes: parseInt(process.env.POLL_INTERVAL_MINUTES ?? "2"),
    is_active_now: schedule.isActiveNow(),
    next_start: nextStart?.toISOString() ?? null,
  });
});

app.get("/api/instances", async (c) => {
  const activeOnly = c.req.query("active_only") !== "false";
  const rows = await db
    .select()
    .from(instances)
    .where(activeOnly ? eq(instances.isActive, true) : undefined)
    .orderBy(desc(instances.createdAt));
  return c.json(rows);
});

app.get("/api/instances/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid id" }, 400);

  const rows = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(rows[0]);
});

app.get("/api/event-groups", async (c) => {
  const days = Math.min(90, Math.max(1, parseInt(c.req.query("days") ?? "30")));

  const rows = await db
    .select({
      timestamp: metrics.timestamp,
      instanceId: metrics.instanceId,
      nUsers: metrics.nUsers,
      queueSize: metrics.queueSize,
      queueEnabled: metrics.queueEnabled,
      pcUsers: metrics.pcUsers,
      currentUsers: metrics.currentUsers,
      instId: instances.id,
      location: instances.location,
      name: instances.name,
      displayName: instances.displayName,
      worldName: instances.worldName,
      capacity: instances.capacity,
      worldThumbnailUrl: instances.worldThumbnailUrl,
      worldImageUrl: instances.worldImageUrl,
      instanceType: instances.instanceType,
      region: instances.region,
      createdAt: instances.createdAt,
      isActive: instances.isActive,
    })
    .from(metrics)
    .innerJoin(instances, eq(metrics.instanceId, instances.id))
    .where(drizzleSql`${metrics.timestamp} > NOW() - MAKE_INTERVAL(days => ${days}::integer)`)
    .orderBy(desc(metrics.timestamp));

  // Fetch all instances for lookup
  const allInstances = await db.select().from(instances);
  const instMap = new Map(allInstances.map((i) => [i.id, i]));

  // Group by event date (JST date of instance.created_at)
  const eventMap = new Map<string, Map<number, { inst: typeof allInstances[0]; metricsList: unknown[] }>>();

  for (const row of rows) {
    const inst = instMap.get(row.instanceId);
    if (!inst || !inst.createdAt) continue;

    const eventKey = eventDateJst(inst.createdAt);
    if (!eventMap.has(eventKey)) eventMap.set(eventKey, new Map());

    const eventInstances = eventMap.get(eventKey)!;
    if (!eventInstances.has(row.instanceId)) {
      eventInstances.set(row.instanceId, { inst, metricsList: [] });
    }

    const computed = computeMetric(
      row.nUsers ?? 0,
      row.queueSize ?? 0,
      row.capacity ?? 0,
      row.currentUsers ?? 0,
    );

    eventInstances.get(row.instanceId)!.metricsList.push({
      timestamp: row.timestamp,
      instance_id: row.instanceId,
      queue_size: computed.effectiveQueue,
      current_users: computed.currentUsers,
      pc_users: row.pcUsers ?? 0,
    });
  }

  const result = Array.from(eventMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([eventDate, eventInstances]) => {
      const instancesArr = Array.from(eventInstances.values()).map(({ inst, metricsList }) => {
        const sorted = (metricsList as { timestamp: Date | null }[]).sort(
          (a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0)
        );
        return {
          id: inst.id,
          location: inst.location,
          name: inst.name,
          display_name: inst.displayName,
          world_name: inst.worldName,
          capacity: inst.capacity,
          world_thumbnail_url: inst.worldThumbnailUrl,
          world_image_url: inst.worldImageUrl,
          instance_type: inst.instanceType,
          region: inst.region,
          created_at: inst.createdAt,
          is_active: inst.isActive,
          metrics: sorted,
        };
      });

      const allTs = instancesArr.flatMap((i) =>
        i.metrics.map((m) => (m as { timestamp: Date | null }).timestamp?.getTime() ?? 0)
      );
      const startTime = allTs.length > 0 ? new Date(Math.min(...allTs)) : new Date(eventDate);
      const endTime = allTs.length > 0 ? new Date(Math.max(...allTs)) : new Date(eventDate);

      return {
        eventDate,
        startTime,
        endTime,
        instances: instancesArr,
      };
    });

  return c.json(result);
});

app.get("/api/metrics", async (c) => {
  const instanceId = c.req.query("instance_id") ? parseInt(c.req.query("instance_id")!) : null;
  const hours = Math.min(2160, Math.max(1, parseInt(c.req.query("hours") ?? "24")));

  const rows = await db
    .select({
      timestamp: metrics.timestamp,
      instanceId: metrics.instanceId,
      nUsers: metrics.nUsers,
      queueSize: metrics.queueSize,
      queueEnabled: metrics.queueEnabled,
      pcUsers: metrics.pcUsers,
      currentUsers: metrics.currentUsers,
      capacity: instances.capacity,
    })
    .from(metrics)
    .innerJoin(instances, eq(metrics.instanceId, instances.id))
    .where(
      instanceId != null
        ? drizzleSql`${metrics.timestamp} > NOW() - MAKE_INTERVAL(hours => ${hours}::integer) AND ${metrics.instanceId} = ${instanceId}`
        : drizzleSql`${metrics.timestamp} > NOW() - MAKE_INTERVAL(hours => ${hours}::integer)`
    )
    .orderBy(desc(metrics.timestamp));

  return c.json(
    rows.map((row) => {
      const computed = computeMetric(row.nUsers ?? 0, row.queueSize ?? 0, row.capacity ?? 0, row.currentUsers ?? 0);
      return {
        timestamp: row.timestamp,
        instance_id: row.instanceId,
        queue_size: computed.effectiveQueue,
        current_users: computed.currentUsers,
        pc_users: row.pcUsers ?? 0,
      };
    })
  );
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.API_PORT ?? "8000");
console.log(`[api] Starting on port ${port}`);

serve({ fetch: app.fetch, port });

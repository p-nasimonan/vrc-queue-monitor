import { eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "./db/index";
import { instances, metrics } from "./db/schema";
import { VRChatAPI, type GroupInstance, type InstanceDetail } from "./vrc-api";

const DETAIL_INTERVAL_MS =
  parseFloat(process.env.INSTANCE_DETAIL_REQUEST_INTERVAL_SECONDS ?? "0.5") * 1_000;

export async function discoverInstances(api: VRChatAPI, groupId: string): Promise<void> {
  console.log("[collector] Discovering group instances...");

  const groupInstances = await api.getGroupInstances(groupId);

  if (groupInstances.length === 0) {
    console.log("[collector] No group instances found");
    await db.update(instances).set({ isActive: false }).where(eq(instances.isActive, true));
    return;
  }

  const activeLocations: string[] = [];

  for (const inst of groupInstances) {
    if (!inst.location) continue;
    activeLocations.push(inst.location);
    await upsertInstance(inst);
  }

  // Deactivate instances not in the current list
  if (activeLocations.length > 0) {
    const deactivated = await db
      .update(instances)
      .set({ isActive: false })
      .where(drizzleSql`${instances.isActive} = TRUE AND ${instances.location} != ALL(${activeLocations})`)
      .returning({ id: instances.id });
    if (deactivated.length > 0) {
      console.log(`[collector] Deactivated ${deactivated.length} old instance(s)`);
    }
  } else {
    await db.update(instances).set({ isActive: false }).where(eq(instances.isActive, true));
  }

  console.log(`[collector] Discovered ${groupInstances.length} instance(s)`);
}

async function upsertInstance(
  data: GroupInstance | InstanceDetail
): Promise<number | null> {
  const result = await db
    .insert(instances)
    .values({
      location: data.location,
      name: data.name,
      displayName: data.displayName,
      worldName: data.worldName,
      capacity: data.capacity,
      worldThumbnailUrl: data.worldThumbnailUrl,
      worldImageUrl: data.worldImageUrl,
      instanceType: data.instanceType,
      region: data.region,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: instances.location,
      set: {
        name: drizzleSql`EXCLUDED.name`,
        displayName: drizzleSql`EXCLUDED.display_name`,
        worldName: drizzleSql`EXCLUDED.world_name`,
        capacity: drizzleSql`EXCLUDED.capacity`,
        worldThumbnailUrl: drizzleSql`EXCLUDED.world_thumbnail_url`,
        worldImageUrl: drizzleSql`EXCLUDED.world_image_url`,
        instanceType: drizzleSql`EXCLUDED.instance_type`,
        region: drizzleSql`EXCLUDED.region`,
        isActive: true,
      },
    })
    .returning({ id: instances.id });

  return result[0]?.id ?? null;
}

export async function collectMetrics(api: VRChatAPI): Promise<void> {
  const activeInstances = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
    .orderBy(instances.createdAt);

  if (activeInstances.length === 0) {
    console.log("[collector] No active instances, skipping");
    return;
  }

  console.log(`[collector] Collecting metrics for ${activeInstances.length} instance(s)...`);
  let saved = 0;

  for (let i = 0; i < activeInstances.length; i++) {
    const inst = activeInstances[i]!;
    if (!inst.location.includes(":")) continue;

    const [worldId, instanceId] = inst.location.split(":", 2) as [string, string];
    const detail = await api.getInstanceDetail(worldId, instanceId);
    if (!detail) continue;

    // Update instance metadata with latest values
    await upsertInstance({ ...detail, location: inst.location });

    // Insert raw metric
    await db.insert(metrics).values({
      instanceId: inst.id,
      nUsers: detail.nUsers,
      queueSize: detail.queueSize,
      queueEnabled: detail.queueEnabled,
      pcUsers: detail.pcUsers,
    });

    saved++;

    if (i < activeInstances.length - 1 && DETAIL_INTERVAL_MS > 0) {
      await new Promise((r) => setTimeout(r, DETAIL_INTERVAL_MS));
    }
  }

  console.log(`[collector] Done: ${saved}/${activeInstances.length} saved`);
}

export async function anyInstanceOpen(): Promise<boolean> {
  try {
    const active = await db
      .select({ id: instances.id })
      .from(instances)
      .where(eq(instances.isActive, true));

    if (active.length === 0) return false;

    for (const inst of active) {
      const rows = await db
        .select({ nUsers: metrics.nUsers, queueEnabled: metrics.queueEnabled })
        .from(metrics)
        .where(
          drizzleSql`${metrics.instanceId} = ${inst.id} AND ${metrics.timestamp} > NOW() - INTERVAL '1 hour'`
        )
        .orderBy(drizzleSql`${metrics.timestamp} DESC`)
        .limit(1);

      const last = rows[0];
      if (last && ((last.nUsers ?? 0) > 0 || last.queueEnabled)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

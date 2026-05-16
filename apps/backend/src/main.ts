import { runMigrations } from "./migrate";
import { ScheduleConfig } from "./scheduler";
import { VRChatAPI } from "./vrc-api";
import { discoverInstances, collectMetrics, anyInstanceOpen } from "./collector";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const groupId = process.env.VRC_GROUP_ID;
  if (!groupId) {
    console.error("[main] VRC_GROUP_ID is required");
    process.exit(1);
  }

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "5") * 60_000;
  const pollOpenMs = parseInt(process.env.POLL_INTERVAL_OPEN_MINUTES ?? "1") * 60_000;
  const discoveryMs = parseInt(process.env.DISCOVERY_INTERVAL_MINUTES ?? "5") * 60_000;
  const schedule = new ScheduleConfig();

  console.log("=".repeat(50));
  console.log("[main] VRC Queue Monitor - Starting");
  console.log(`[main] Group ID: ${groupId}`);
  console.log(`[main] Poll: ${pollIntervalMs / 60_000}min  Discovery: ${discoveryMs / 60_000}min`);
  console.log(`[main] Schedule: ${schedule.statusMessage()}`);
  console.log("=".repeat(50));

  // Run migrations
  await runMigrations();

  // VRChat login (up to 3 attempts)
  const api = new VRChatAPI();
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[main] VRChat auth attempt ${attempt}/3...`);
    if (await api.login()) break;
    if (attempt === 3) {
      console.error("[main] Authentication failed after 3 attempts");
      process.exit(1);
    }
  }

  let lastDiscovery = 0;
  let lastMetrics = 0;

  const run = async () => {
    const now = Date.now();
    if (!schedule.isActiveNow()) return;

    if (now - lastDiscovery >= discoveryMs) {
      await discoverInstances(api, groupId);
      lastDiscovery = Date.now();
    }

    const currentPoll = (await anyInstanceOpen()) ? pollOpenMs : pollIntervalMs;
    if (now - lastMetrics >= currentPoll) {
      await collectMetrics(api);
      lastMetrics = Date.now();
    }
  };

  // Main loop
  const TICK_MS = 5_000;
  process.on("SIGINT", () => {
    console.log("[main] Shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("[main] Shutting down...");
    process.exit(0);
  });

  while (true) {
    try {
      await run();
    } catch (err) {
      console.error("[main] Unhandled error in loop:", err);
    }
    await sleep(TICK_MS);
  }
}

main().catch((err) => {
  console.error("[main] Fatal:", err);
  process.exit(1);
});

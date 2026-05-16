import { VRChat } from "vrchat";
import type { Instance, GroupInstance as VRCGroupInstance } from "vrchat";

export interface InstanceDetail {
  location: string;
  name: string;
  displayName: string | null;
  worldName: string;
  worldThumbnailUrl: string | null;
  worldImageUrl: string | null;
  instanceType: string;
  region: string;
  capacity: number;
  nUsers: number;
  queueSize: number;
  queueEnabled: boolean;
  pcUsers: number;
}

export interface GroupInstance {
  location: string;
  name: string;
  displayName: string | null;
  worldName: string;
  worldThumbnailUrl: string | null;
  worldImageUrl: string | null;
  instanceType: string;
  region: string;
  capacity: number;
}

function str(v: unknown): string | null {
  return v != null && v !== "" ? String(v) : null;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v != null && !isNaN(Number(v))) return Number(v);
  return 0;
}

function extractWorld(world: unknown): {
  name: string;
  thumbnail: string | null;
  image: string | null;
} {
  if (world == null || typeof world !== "object") {
    return { name: "Unknown", thumbnail: null, image: null };
  }
  const w = world as Record<string, unknown>;
  return {
    name: str(w.name) ?? "Unknown",
    thumbnail: str(w.thumbnailImageUrl) ?? str(w.thumbnail_image_url) ?? null,
    image: str(w.imageUrl) ?? str(w.image_url) ?? null,
  };
}

export class VRChatAPI {
  private client: VRChat | null = null;
  private authenticated = false;
  private rateLimitUntil: number | null = null;
  private lastLoginAttempt: number | null = null;

  private createClient(): VRChat {
    return new VRChat({
      application: {
        name: "vrc-queue-monitor",
        version: "1.0.0",
        contact: process.env.VRC_USERNAME ?? "admin@example.com",
      },
    });
  }

  async login(): Promise<boolean> {
    const now = Date.now();

    if (this.rateLimitUntil && now < this.rateLimitUntil) {
      const wait = this.rateLimitUntil - now;
      console.log(`[vrc-api] Rate limited, waiting ${Math.ceil(wait / 1000)}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }

    if (this.lastLoginAttempt && now - this.lastLoginAttempt < 5_000) {
      await new Promise((r) => setTimeout(r, 5_000 - (now - this.lastLoginAttempt!)));
    }

    this.lastLoginAttempt = Date.now();

    const username = process.env.VRC_USERNAME;
    const password = process.env.VRC_PASSWORD;
    const totpSecret = process.env.TOTP_SECRET;

    if (!username || !password) {
      console.error("[vrc-api] VRC_USERNAME or VRC_PASSWORD not set");
      return false;
    }
    if (!totpSecret) {
      console.error("[vrc-api] TOTP_SECRET not set (required)");
      return false;
    }

    try {
      this.client = this.createClient();
      const resp = await this.client.login({ username, password, totpSecret });
      const data = resp.data as Record<string, unknown> | null;
      const displayName = str(data?.["displayName"]) ?? username;
      console.log(`[vrc-api] Logged in as: ${displayName}`);
      this.authenticated = true;
      this.rateLimitUntil = null;
      return true;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; headers?: Record<string, string> } };
      const retryAfter = parseInt(e.response?.headers?.["retry-after"] ?? "", 10);
      if (!isNaN(retryAfter) && retryAfter > 0) {
        this.rateLimitUntil = Date.now() + retryAfter * 1_000;
        console.error(`[vrc-api] Rate limited. Retry after ${retryAfter}s`);
      } else {
        console.error("[vrc-api] Login failed:", (err as Error).message ?? err);
      }
      this.client = null;
      return false;
    }
  }

  async ensureAuthenticated(): Promise<boolean> {
    if (this.authenticated && this.client) return true;
    return this.login();
  }

  async getGroupInstances(groupId: string): Promise<GroupInstance[]> {
    if (!(await this.ensureAuthenticated()) || !this.client) return [];

    try {
      const resp = await this.client.getGroupInstances({ path: { groupId } });
      const items = (resp.data ?? []) as VRCGroupInstance[];
      console.log(`[vrc-api] Found ${items.length} group instances`);
      return items.map((inst) => this.normalizeGroupInstance(inst as unknown as Record<string, unknown>));
    } catch (err) {
      console.error("[vrc-api] Failed to get group instances:", (err as Error).message);
      return [];
    }
  }

  private normalizeGroupInstance(inst: Record<string, unknown>): GroupInstance {
    const world = extractWorld(inst["world"]);
    const location = str(inst["location"]) ?? str(inst["instanceId"]) ?? "";
    return {
      location,
      name: str(inst["name"]) ?? location,
      displayName: str(inst["displayName"]) ?? str(inst["display_name"]),
      worldName: world.name,
      worldThumbnailUrl: world.thumbnail,
      worldImageUrl: world.image,
      instanceType: str(inst["type"]) ?? "unknown",
      region: str(inst["region"]) ?? str(inst["photonRegion"]) ?? "unknown",
      capacity: num(inst["capacity"]),
    };
  }

  async getInstanceDetail(worldId: string, instanceId: string): Promise<InstanceDetail | null> {
    if (!this.client || !this.authenticated) return null;

    try {
      const resp = await this.client.getInstance({ path: { worldId, instanceId } });
      return this.normalizeInstanceDetail(resp.data as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e.response?.status === 401) {
        console.warn("[vrc-api] Auth expired, re-logging in...");
        this.authenticated = false;
        if (!(await this.login()) || !this.client) return null;
        try {
          const resp = await this.client.getInstance({ path: { worldId, instanceId } });
          return this.normalizeInstanceDetail(resp.data as unknown as Record<string, unknown>);
        } catch (retryErr) {
          console.error("[vrc-api] Retry after re-auth failed:", (retryErr as Error).message);
          return null;
        }
      }
      console.warn(`[vrc-api] Failed to get instance ${worldId}:${instanceId}:`, (e as Error).message ?? err);
      return null;
    }
  }

  private normalizeInstanceDetail(inst: Record<string, unknown>): InstanceDetail {
    const world = extractWorld(inst["world"]);
    const platforms = (inst["platforms"] ?? {}) as Record<string, number>;
    const location = str(inst["location"]) ?? str(inst["instanceId"]) ?? "";

    const queueEnabled = Boolean(inst["queueEnabled"] ?? inst["queue_enabled"]);
    const queueSize = num(inst["queueSize"] ?? inst["queue_size"]);
    const nUsers = num(inst["nUsers"] ?? inst["n_users"] ?? inst["userCount"]);
    const pcUsers = platforms["standalonewindows"] ?? 0;

    console.log(
      `[vrc-api] ${location}: users=${nUsers} queue=${queueSize} enabled=${queueEnabled} ` +
      `pc=${pcUsers} cap=${num(inst["capacity"])}`
    );

    return {
      location,
      name: str(inst["name"]) ?? location,
      displayName: str(inst["displayName"]) ?? str(inst["display_name"]),
      worldName: world.name,
      worldThumbnailUrl: world.thumbnail,
      worldImageUrl: world.image,
      instanceType: str(inst["type"]) ?? "unknown",
      region: str(inst["region"]) ?? str(inst["photonRegion"]) ?? "unknown",
      capacity: num(inst["capacity"]),
      nUsers,
      queueSize,
      queueEnabled,
      pcUsers,
    };
  }
}

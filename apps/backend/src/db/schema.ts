import { pgTable, serial, text, integer, boolean, timestamp, smallint } from "drizzle-orm/pg-core";

export const instances = pgTable("instances", {
  id: serial("id").primaryKey(),
  location: text("location").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  worldName: text("world_name").notNull(),
  capacity: integer("capacity").notNull().default(0),
  worldThumbnailUrl: text("world_thumbnail_url"),
  worldImageUrl: text("world_image_url"),
  instanceType: text("instance_type"),
  region: text("region"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const metrics = pgTable("metrics", {
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  instanceId: integer("instance_id").notNull().references(() => instances.id),
  queueSize: integer("queue_size").notNull().default(0),
  currentUsers: integer("current_users").notNull().default(0),
  pcUsers: smallint("pc_users").notNull().default(0),
  nUsers: smallint("n_users").notNull().default(0),
  queueEnabled: boolean("queue_enabled").notNull().default(false),
});

export type Instance = typeof instances.$inferSelect;
export type NewInstance = typeof instances.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;

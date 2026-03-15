-- Migration: Add display_name to instances, pc_users to metrics

ALTER TABLE instances ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS pc_users SMALLINT NOT NULL DEFAULT 0;

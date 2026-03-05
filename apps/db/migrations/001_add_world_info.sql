-- Migration: Add world information fields to instances table

-- 既存テーブルに新カラムを追加
ALTER TABLE instances
ADD COLUMN IF NOT EXISTS world_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS world_image_url TEXT,
ADD COLUMN IF NOT EXISTS instance_type TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;

-- インデックス追加（region検索用）
CREATE INDEX IF NOT EXISTS idx_instances_region ON instances(region);
CREATE INDEX IF NOT EXISTS idx_instances_type ON instances(instance_type);

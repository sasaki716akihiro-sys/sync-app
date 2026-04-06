-- 夫婦の木：ポイント・レベル・最終加点日カラムを追加
ALTER TABLE sync_status
  ADD COLUMN IF NOT EXISTS tree_points          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tree_level           INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tree_last_point_date TEXT;

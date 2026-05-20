-- ユーザー別データ分離マイグレーション
-- 実行場所: Supabase Dashboard > SQL Editor

-- 1. ユーザーウォッチリストテーブル（銘柄はグローバルキャッシュ、紐付けのみユーザー別）
CREATE TABLE IF NOT EXISTS user_watchlist (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stock_code)
);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id);

-- 2. simulated_positions に user_id 追加
ALTER TABLE simulated_positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_simulated_positions_user ON simulated_positions(user_id);

-- 3. simulated_trades に user_id 追加
ALTER TABLE simulated_trades ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_simulated_trades_user ON simulated_trades(user_id);

-- 4. claude_portfolio をシングルトンからユーザー別に再作成
--    ※既存データは削除されます
DROP TABLE IF EXISTS claude_portfolio CASCADE;
CREATE TABLE claude_portfolio (
  id SERIAL PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash DECIMAL(15,2) NOT NULL DEFAULT 1000000,
  initial_capital DECIMAL(15,2) NOT NULL DEFAULT 1000000,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. claude_positions に user_id 追加
ALTER TABLE claude_positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_claude_positions_user ON claude_positions(user_id);

-- 6. claude_trades に user_id 追加
ALTER TABLE claude_trades ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_claude_trades_user ON claude_trades(user_id);

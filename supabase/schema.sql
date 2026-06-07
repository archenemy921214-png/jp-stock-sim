-- 銘柄テーブル（共有キャッシュ）
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  exchange VARCHAR(20) DEFAULT 'TSE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザーウォッチリスト（銘柄とユーザーの紐付け）
CREATE TABLE IF NOT EXISTS user_watchlist (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stock_code)
);

-- 価格履歴テーブル
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  date DATE NOT NULL,
  open DECIMAL(12,2) NOT NULL,
  high DECIMAL(12,2) NOT NULL,
  low DECIMAL(12,2) NOT NULL,
  close DECIMAL(12,2) NOT NULL,
  volume BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, date)
);

-- テクニカル指標テーブル
CREATE TABLE IF NOT EXISTS indicators (
  id SERIAL PRIMARY KEY,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  date DATE NOT NULL,
  ma5 DECIMAL(12,2),
  ma25 DECIMAL(12,2),
  ma75 DECIMAL(12,2),
  vol5avg DECIMAL(20,2),
  high20 DECIMAL(12,2),
  rsi14 DECIMAL(6,2),
  macd_line DECIMAL(12,4),
  macd_signal DECIMAL(12,4),
  macd_hist DECIMAL(12,4),
  bb_upper DECIMAL(12,2),
  bb_middle DECIMAL(12,2),
  bb_lower DECIMAL(12,2),
  atr14 DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, date)
);

-- indicators v2 マイグレーション（既存DBに対して実行）
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS rsi14 DECIMAL(6,2);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS macd_line DECIMAL(12,4);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS macd_signal DECIMAL(12,4);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS macd_hist DECIMAL(12,4);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS bb_upper DECIMAL(12,2);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS bb_middle DECIMAL(12,2);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS bb_lower DECIMAL(12,2);
-- ALTER TABLE indicators ADD COLUMN IF NOT EXISTS atr14 DECIMAL(12,2);

-- シグナルテーブル
CREATE TABLE IF NOT EXISTS signals (
  id SERIAL PRIMARY KEY,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  date DATE NOT NULL,
  signal_type VARCHAR(10) NOT NULL,
  score INTEGER,
  reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, date, signal_type)
);

-- バックテスト仮想ポジション（ユーザー別）
CREATE TABLE IF NOT EXISTS simulated_positions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  signal_score INTEGER,
  signal_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- バックテスト取引履歴（ユーザー別）
CREATE TABLE IF NOT EXISTS simulated_trades (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id INTEGER REFERENCES simulated_positions(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  exit_date DATE NOT NULL,
  exit_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 100,
  pnl DECIMAL(12,2) NOT NULL,
  exit_reason TEXT NOT NULL,
  signal_score INTEGER,
  signal_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claude仮想ポートフォリオ（ユーザー別）
CREATE TABLE IF NOT EXISTS claude_portfolio (
  id SERIAL PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash DECIMAL(15,2) NOT NULL DEFAULT 1000000,
  initial_capital DECIMAL(15,2) NOT NULL DEFAULT 1000000,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claude保有ポジション（ユーザー別）
CREATE TABLE IF NOT EXISTS claude_positions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  stock_name VARCHAR(200) NOT NULL,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  claude_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claude取引履歴（ユーザー別）
CREATE TABLE IF NOT EXISTS claude_trades (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code VARCHAR(10) NOT NULL,
  stock_name VARCHAR(200) NOT NULL,
  trade_type VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  cash_before DECIMAL(15,2) NOT NULL,
  cash_after DECIMAL(15,2) NOT NULL,
  pnl DECIMAL(12,2),
  claude_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 通知設定（グローバル）
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_stock_date ON price_history(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_stock_date ON indicators(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_stock_date ON signals(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_simulated_positions_user ON simulated_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_simulated_trades_user ON simulated_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_simulated_trades_stock ON simulated_trades(stock_code);
CREATE INDEX IF NOT EXISTS idx_simulated_trades_exit_date ON simulated_trades(exit_date DESC);
CREATE INDEX IF NOT EXISTS idx_claude_positions_user ON claude_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_claude_trades_user ON claude_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_claude_trades_date ON claude_trades(date DESC);

-- 初期データ
INSERT INTO notification_settings (id, email, enabled) VALUES (1, '', TRUE) ON CONFLICT (id) DO NOTHING;

-- 銘柄テーブル
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  exchange VARCHAR(20) DEFAULT 'TSE',
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, date)
);

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

-- 仮想ポジションテーブル
CREATE TABLE IF NOT EXISTS simulated_positions (
  id SERIAL PRIMARY KEY,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  signal_score INTEGER,
  signal_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 仮想取引履歴テーブル
CREATE TABLE IF NOT EXISTS simulated_trades (
  id SERIAL PRIMARY KEY,
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

-- Claude仮想ポートフォリオ（シングルトン）
CREATE TABLE IF NOT EXISTS claude_portfolio (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cash DECIMAL(15,2) NOT NULL DEFAULT 1000000,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claude保有ポジション
CREATE TABLE IF NOT EXISTS claude_positions (
  id SERIAL PRIMARY KEY,
  stock_code VARCHAR(10) NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
  stock_name VARCHAR(200) NOT NULL,
  entry_date DATE NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  quantity INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  claude_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claude取引履歴
CREATE TABLE IF NOT EXISTS claude_trades (
  id SERIAL PRIMARY KEY,
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

-- 通知設定（シングルトン）
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_price_history_stock_date ON price_history(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_stock_date ON indicators(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_stock_date ON signals(stock_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_stock ON simulated_trades(stock_code);
CREATE INDEX IF NOT EXISTS idx_trades_exit_date ON simulated_trades(exit_date DESC);
CREATE INDEX IF NOT EXISTS idx_claude_trades_date ON claude_trades(date DESC);

-- 初期データ
INSERT INTO claude_portfolio (id, cash) VALUES (1, 1000000) ON CONFLICT (id) DO NOTHING;
INSERT INTO notification_settings (id, email, enabled) VALUES (1, '', TRUE) ON CONFLICT (id) DO NOTHING;

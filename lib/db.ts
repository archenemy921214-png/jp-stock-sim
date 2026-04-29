import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'stock_sim.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      exchange TEXT DEFAULT 'TSE',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL,
      UNIQUE(stock_code, date)
    );

    CREATE TABLE IF NOT EXISTS indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      date TEXT NOT NULL,
      ma5 REAL,
      ma25 REAL,
      ma75 REAL,
      vol5avg REAL,
      high20 REAL,
      UNIQUE(stock_code, date)
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      date TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      score REAL,
      reasons TEXT DEFAULT '[]',
      UNIQUE(stock_code, date, signal_type)
    );

    CREATE TABLE IF NOT EXISTS simulated_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 100,
      status TEXT DEFAULT 'open',
      signal_score REAL,
      signal_reasons TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS simulated_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_date TEXT NOT NULL,
      exit_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 100,
      pnl REAL NOT NULL,
      exit_reason TEXT NOT NULL,
      signal_score REAL,
      signal_reasons TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Claude仮想ポートフォリオ
    CREATE TABLE IF NOT EXISTS claude_portfolio (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cash REAL NOT NULL DEFAULT 1000000,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claude_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,
      stock_name TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT DEFAULT 'open',
      claude_reasoning TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claude_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      trade_type TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      amount REAL NOT NULL,
      cash_before REAL NOT NULL,
      cash_after REAL NOT NULL,
      pnl REAL,
      claude_reasoning TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_stock_date ON price_history(stock_code, date DESC);
    CREATE INDEX IF NOT EXISTS idx_indicators_stock_date ON indicators(stock_code, date DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_stock_date ON signals(stock_code, date DESC);
    CREATE INDEX IF NOT EXISTS idx_trades_stock ON simulated_trades(stock_code);
    CREATE INDEX IF NOT EXISTS idx_trades_exit_date ON simulated_trades(exit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_claude_trades_date ON claude_trades(date DESC);
  `)

  db.prepare('INSERT OR IGNORE INTO claude_portfolio (id, cash) VALUES (1, 1000000)').run()
  const defaultEmail = process.env.NOTIFY_EMAIL ?? ''
  db.prepare('INSERT OR IGNORE INTO notification_settings (id, email, enabled) VALUES (1, ?, 1)').run(defaultEmail)
}

export function parseReasons(val: string | string[] | null | undefined): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val) } catch { return [] }
}

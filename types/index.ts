export interface Stock {
  id: number
  code: string
  name: string
  exchange: string
  created_at: string
}

export interface PriceHistory {
  id: number
  stock_code: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Indicator {
  id: number
  stock_code: string
  date: string
  ma5: number | null
  ma25: number | null
  ma75: number | null
  vol5avg: number | null
  high20: number | null
}

export interface Signal {
  id: number
  stock_code: string
  date: string
  signal_type: 'buy' | 'sell'
  score: number | null
  reasons: string[]
}

export interface SimulatedPosition {
  id: number
  stock_code: string
  entry_date: string
  entry_price: number
  quantity: number
  status: 'open' | 'closed'
  signal_score: number | null
  signal_reasons: string[]
  created_at: string
}

export interface SimulatedTrade {
  id: number
  position_id: number
  stock_code: string
  entry_date: string
  entry_price: number
  exit_date: string
  exit_price: number
  quantity: number
  pnl: number
  exit_reason: string
  signal_score: number | null
  signal_reasons: string[]
  created_at: string
}

export interface StockWithStatus extends Stock {
  latestPrice?: number
  latestDate?: string
  openPosition?: SimulatedPosition | null
  lastSignalScore?: number
  tradeCount?: number
}

export interface ClaudePosition {
  id: number
  stock_code: string
  stock_name: string
  entry_date: string
  entry_price: number
  quantity: number
  status: 'open' | 'closed'
  claude_reasoning: string
  current_price?: number
  current_value?: number
  unrealized_pnl?: number
}

export interface ClaudeTrade {
  id: number
  stock_code: string
  stock_name: string
  trade_type: 'buy' | 'sell'
  date: string
  price: number
  quantity: number
  amount: number
  cash_before: number
  cash_after: number
  pnl: number | null
  claude_reasoning: string
  created_at: string
}

export interface ClaudePortfolio {
  cash: number
  positions: ClaudePosition[]
  trades: ClaudeTrade[]
  totalValue: number
  realizedPnl: number
  initialCapital: number
}

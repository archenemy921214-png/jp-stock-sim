import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const portfolio = db.prepare('SELECT * FROM claude_portfolio WHERE id = 1').get() as any
  const positions = db.prepare(
    "SELECT * FROM claude_positions WHERE status = 'open' ORDER BY entry_date ASC"
  ).all() as any[]
  const trades = db.prepare(
    'SELECT * FROM claude_trades ORDER BY date DESC LIMIT 100'
  ).all() as any[]

  // ポートフォリオ評価額を計算
  let positionsValue = 0
  const enrichedPositions = positions.map(pos => {
    // 最新価格を取得
    const latest = db.prepare(
      'SELECT close FROM price_history WHERE stock_code = ? ORDER BY date DESC LIMIT 1'
    ).get(pos.stock_code) as any
    const currentPrice = latest?.close ?? pos.entry_price
    const currentValue = currentPrice * pos.quantity
    const unrealizedPnl = (currentPrice - pos.entry_price) * pos.quantity
    positionsValue += currentValue
    return { ...pos, current_price: currentPrice, current_value: currentValue, unrealized_pnl: unrealizedPnl }
  })

  const totalValue = (portfolio?.cash ?? 1000000) + positionsValue

  // 累計損益
  const realizedPnl = trades
    .filter(t => t.trade_type === 'sell')
    .reduce((s, t) => s + (t.pnl ?? 0), 0)

  return NextResponse.json({
    cash: portfolio?.cash ?? 1000000,
    positions: enrichedPositions,
    trades,
    totalValue,
    realizedPnl,
    initialCapital: 1000000
  })
}

export async function POST(request: Request) {
  const { action } = await request.json()
  const db = getDb()

  if (action === 'reset') {
    db.transaction(() => {
      db.prepare('DELETE FROM claude_trades').run()
      db.prepare('DELETE FROM claude_positions').run()
      db.prepare(
        'INSERT OR REPLACE INTO claude_portfolio (id, cash, updated_at) VALUES (1, 1000000, datetime(\'now\'))'
      ).run()
    })()
    return NextResponse.json({ success: true, message: 'ポートフォリオをリセットしました' })
  }

  return NextResponse.json({ error: '不明なアクション' }, { status: 400 })
}

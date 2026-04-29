import { NextResponse } from 'next/server'
import { getDb, parseReasons } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const db = getDb()

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const since = oneYearAgo.toISOString().split('T')[0]

  const prices = db.prepare(
    'SELECT * FROM price_history WHERE stock_code = ? AND date >= ? ORDER BY date ASC'
  ).all(code, since)

  const indicators = db.prepare(
    'SELECT * FROM indicators WHERE stock_code = ? AND date >= ? ORDER BY date ASC'
  ).all(code, since)

  const signals = (db.prepare(
    "SELECT * FROM signals WHERE stock_code = ? AND date >= ? AND signal_type = 'buy' ORDER BY date ASC"
  ).all(code, since) as any[]).map(s => ({ ...s, reasons: parseReasons(s.reasons) }))

  const positions = (db.prepare(
    'SELECT * FROM simulated_positions WHERE stock_code = ? ORDER BY entry_date ASC'
  ).all(code) as any[]).map(p => ({ ...p, signal_reasons: parseReasons(p.signal_reasons) }))

  const trades = (db.prepare(
    'SELECT * FROM simulated_trades WHERE stock_code = ? ORDER BY exit_date DESC'
  ).all(code) as any[]).map(t => ({ ...t, signal_reasons: parseReasons(t.signal_reasons) }))

  return NextResponse.json({ prices, indicators, signals, positions, trades })
}

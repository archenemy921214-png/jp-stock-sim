import { NextResponse } from 'next/server'
import { getDb, parseReasons } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const db = getDb()

  const trades = (code
    ? db.prepare(`
        SELECT t.*, s.name as stock_name
        FROM simulated_trades t JOIN stocks s ON s.code = t.stock_code
        WHERE t.stock_code = ? ORDER BY t.exit_date DESC
      `).all(code)
    : db.prepare(`
        SELECT t.*, s.name as stock_name
        FROM simulated_trades t JOIN stocks s ON s.code = t.stock_code
        ORDER BY t.exit_date DESC
      `).all()
  ) as any[]

  return NextResponse.json(
    trades.map(t => ({ ...t, signal_reasons: parseReasons(t.signal_reasons) }))
  )
}

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

export async function GET() {
  try {
    const sb = getDb()

    // JOIN不要：個別クエリ＋メモリ結合
    const [tradesRes, stocksRes] = await Promise.all([
      sb.from('simulated_trades').select('*').order('exit_date', { ascending: true }),
      sb.from('stocks').select('code, name'),
    ])

    if (tradesRes.error) throw tradesRes.error
    if (stocksRes.error) throw stocksRes.error

    const stockMap = Object.fromEntries((stocksRes.data ?? []).map(s => [s.code, masterMap[s.code] || s.name]))
    const trades = (tradesRes.data ?? []).map(t => ({
      ...t,
      stockName: stockMap[t.stock_code] ?? t.stock_code,
    }))

    const totalPnl = trades.reduce((s, t) => s + Number(t.pnl), 0)
    const wins = trades.filter(t => Number(t.pnl) > 0)
    const losses = trades.filter(t => Number(t.pnl) <= 0)
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length : 0

    const monthlyMap: Record<string, number> = {}
    for (const t of trades) {
      const month = (t.exit_date as string).slice(0, 7)
      monthlyMap[month] = (monthlyMap[month] || 0) + Number(t.pnl)
    }
    const monthly = Object.entries(monthlyMap).sort().map(([month, pnl]) => ({ month, pnl }))

    const stockPerfMap: Record<string, { name: string; pnl: number; count: number; wins: number }> = {}
    for (const t of trades) {
      if (!stockPerfMap[t.stock_code]) {
        stockPerfMap[t.stock_code] = { name: t.stockName, pnl: 0, count: 0, wins: 0 }
      }
      stockPerfMap[t.stock_code].pnl += Number(t.pnl)
      stockPerfMap[t.stock_code].count++
      if (Number(t.pnl) > 0) stockPerfMap[t.stock_code].wins++
    }
    const byStock = Object.entries(stockPerfMap)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.pnl - a.pnl)

    return NextResponse.json({
      totalPnl, totalTrades: trades.length,
      winCount: wins.length, lossCount: losses.length,
      winRate, avgWin, avgLoss, monthly, byStock,
    })
  } catch (e: any) {
    console.error('[GET /api/performance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

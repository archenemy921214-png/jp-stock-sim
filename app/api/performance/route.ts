import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const sb = getDb()

  const { data: list, error } = await sb
    .from('simulated_trades')
    .select('*, stocks(name)')
    .order('exit_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const trades = list ?? []

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

  const stockMap: Record<string, { name: string; pnl: number; count: number; wins: number }> = {}
  for (const t of trades) {
    if (!stockMap[t.stock_code]) {
      stockMap[t.stock_code] = { name: (t as any).stocks?.name || t.stock_code, pnl: 0, count: 0, wins: 0 }
    }
    stockMap[t.stock_code].pnl += Number(t.pnl)
    stockMap[t.stock_code].count++
    if (Number(t.pnl) > 0) stockMap[t.stock_code].wins++
  }
  const byStock = Object.entries(stockMap)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.pnl - a.pnl)

  return NextResponse.json({
    totalPnl, totalTrades: trades.length,
    winCount: wins.length, lossCount: losses.length,
    winRate, avgWin, avgLoss, monthly, byStock,
  })
}

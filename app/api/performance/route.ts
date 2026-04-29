import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const list = db.prepare(`
    SELECT t.*, s.name as stock_name
    FROM simulated_trades t JOIN stocks s ON s.code = t.stock_code
    ORDER BY t.exit_date ASC
  `).all() as any[]

  const totalPnl = list.reduce((s, t) => s + Number(t.pnl), 0)
  const wins = list.filter(t => Number(t.pnl) > 0)
  const losses = list.filter(t => Number(t.pnl) <= 0)
  const winRate = list.length > 0 ? (wins.length / list.length) * 100 : 0
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length : 0

  const monthlyMap: Record<string, number> = {}
  for (const t of list) {
    const month = t.exit_date.slice(0, 7)
    monthlyMap[month] = (monthlyMap[month] || 0) + Number(t.pnl)
  }
  const monthly = Object.entries(monthlyMap).sort().map(([month, pnl]) => ({ month, pnl }))

  const stockMap: Record<string, { name: string; pnl: number; count: number; wins: number }> = {}
  for (const t of list) {
    if (!stockMap[t.stock_code]) {
      stockMap[t.stock_code] = { name: t.stock_name || t.stock_code, pnl: 0, count: 0, wins: 0 }
    }
    stockMap[t.stock_code].pnl += Number(t.pnl)
    stockMap[t.stock_code].count++
    if (Number(t.pnl) > 0) stockMap[t.stock_code].wins++
  }
  const byStock = Object.entries(stockMap)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.pnl - a.pnl)

  return NextResponse.json({ totalPnl, totalTrades: list.length, winCount: wins.length, lossCount: losses.length, winRate, avgWin, avgLoss, monthly, byStock })
}

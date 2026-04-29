import type { PriceHistory } from '@/types'
import type { Period } from './dummyData'
import { periodToDays } from './dummyData'

export interface BacktestParams {
  stockCode: string
  period: Period
  shortMaPeriod: number
  longMaPeriod: number
  stopLossRate: number
  takeProfitRate: number
  quantity: number
  commission: number
}

export interface BacktestTrade {
  entryDate: string
  exitDate: string
  stockCode: string
  entryPrice: number
  exitPrice: number
  quantity: number
  pnl: number
  pnlRate: number
  exitReason: string
}

export interface BacktestResult {
  totalPnl: number
  tradeCount: number
  winCount: number
  lossCount: number
  winRate: number
  avgWin: number
  avgLoss: number
  payoffRatio: number
  maxDrawdown: number
  monthly: { month: string; pnl: number }[]
  byStock: { code: string; pnl: number; count: number; wins: number }[]
  trades: BacktestTrade[]
}

function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]
    return sum / period
  })
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

function periodStartDate(endDateStr: string, period: Period): string {
  if (period === '3m') return addMonths(endDateStr, 3)
  if (period === '6m') return addMonths(endDateStr, 6)
  const d = new Date(endDateStr)
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().split('T')[0]
}

export function runBacktest(
  params: BacktestParams,
  allPrices: PriceHistory[]
): BacktestResult {
  if (allPrices.length === 0) return emptyResult()

  const sorted = [...allPrices].sort((a, b) => a.date.localeCompare(b.date))
  const closes = sorted.map(p => p.close)
  const shortMAs = calcSMA(closes, params.shortMaPeriod)
  const longMAs = calcSMA(closes, params.longMaPeriod)

  const endDateStr = sorted[sorted.length - 1].date
  const startDateStr = periodStartDate(endDateStr, params.period)

  const trades: BacktestTrade[] = []
  let openPos: { entryDate: string; entryPrice: number } | null = null

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]
    const currShort = shortMAs[i]
    const currLong = longMAs[i]
    const prevShort = shortMAs[i - 1]
    const prevLong = longMAs[i - 1]

    if (currShort === null || currLong === null || prevShort === null || prevLong === null) continue
    if (curr.date < startDateStr) continue

    if (openPos) {
      const pnlRate = (curr.close - openPos.entryPrice) / openPos.entryPrice * 100
      let exitReason: string | null = null

      if (pnlRate <= -params.stopLossRate) {
        exitReason = `損切り（${pnlRate.toFixed(2)}%）`
      } else if (pnlRate >= params.takeProfitRate) {
        exitReason = `利確（+${pnlRate.toFixed(2)}%）`
      } else if (currShort < currLong && prevShort >= prevLong) {
        exitReason = 'デッドクロス'
      }

      if (exitReason) {
        const gross = (curr.close - openPos.entryPrice) * params.quantity
        trades.push({
          entryDate: openPos.entryDate,
          exitDate: curr.date,
          stockCode: params.stockCode,
          entryPrice: openPos.entryPrice,
          exitPrice: curr.close,
          quantity: params.quantity,
          pnl: gross - params.commission * 2,
          pnlRate,
          exitReason,
        })
        openPos = null
      }
    }

    if (!openPos && currShort > currLong && prevShort <= prevLong) {
      openPos = { entryDate: curr.date, entryPrice: curr.close }
    }
  }

  if (openPos) {
    const last = sorted[sorted.length - 1]
    const pnlRate = (last.close - openPos.entryPrice) / openPos.entryPrice * 100
    const gross = (last.close - openPos.entryPrice) * params.quantity
    trades.push({
      entryDate: openPos.entryDate,
      exitDate: last.date,
      stockCode: params.stockCode,
      entryPrice: openPos.entryPrice,
      exitPrice: last.close,
      quantity: params.quantity,
      pnl: gross - params.commission * 2,
      pnlRate,
      exitReason: '期間終了',
    })
  }

  return aggregateTrades(trades, params.stockCode)
}

function aggregateTrades(trades: BacktestTrade[], stockCode: string): BacktestResult {
  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl <= 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const winCount = wins.length
  const lossCount = losses.length
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0
  const avgWin = winCount > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / winCount : 0
  const avgLoss = lossCount > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / lossCount : 0
  const payoffRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  let cumPnl = 0
  let peak = 0
  let maxDrawdown = 0
  for (const t of trades) {
    cumPnl += t.pnl
    if (cumPnl > peak) peak = cumPnl
    const dd = peak - cumPnl
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const monthlyMap = new Map<string, number>()
  for (const t of trades) {
    const month = t.exitDate.substring(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + t.pnl)
  }
  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl: Math.round(pnl) }))

  const byStock = [
    { code: stockCode, pnl: Math.round(totalPnl), count: trades.length, wins: winCount },
  ]

  return {
    totalPnl: Math.round(totalPnl),
    tradeCount: trades.length,
    winCount,
    lossCount,
    winRate,
    avgWin: Math.round(avgWin),
    avgLoss: Math.round(avgLoss),
    payoffRatio,
    maxDrawdown: Math.round(maxDrawdown),
    monthly,
    byStock,
    trades,
  }
}

function emptyResult(): BacktestResult {
  return {
    totalPnl: 0,
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    payoffRatio: 0,
    maxDrawdown: 0,
    monthly: [],
    byStock: [],
    trades: [],
  }
}

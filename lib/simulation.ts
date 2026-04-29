import { PriceHistory, Indicator } from '@/types'
import { calculateBuySignal, checkSellCondition } from './signals'

export interface SimPosition {
  entryDate: string
  entryPrice: number
  quantity: number
  signalScore: number
  signalReasons: string[]
  entryIndex: number
}

export interface SimTrade {
  entryDate: string
  entryPrice: number
  exitDate: string
  exitPrice: number
  quantity: number
  pnl: number
  exitReason: string
  signalScore: number
  signalReasons: string[]
}

export function runSimulation(
  priceHistory: PriceHistory[],
  indicatorList: Indicator[]
): { trades: SimTrade[]; openPosition: SimPosition | null } {
  const sorted = [...priceHistory].sort((a, b) => a.date.localeCompare(b.date))
  const sortedInd = [...indicatorList].sort((a, b) => a.date.localeCompare(b.date))

  const indByDate = new Map(sortedInd.map(i => [i.date, i]))

  const trades: SimTrade[] = []
  let openPos: SimPosition | null = null

  for (let i = 75; i < sorted.length; i++) {
    const current = sorted[i]
    const ind = indByDate.get(current.date)
    if (!ind) continue

    // 売り判定（ポジションがある場合）
    if (openPos) {
      const holdingDays = i - openPos.entryIndex
      const sell = checkSellCondition(current, ind, openPos.entryPrice, holdingDays)

      if (sell.shouldSell) {
        trades.push({
          entryDate: openPos.entryDate,
          entryPrice: openPos.entryPrice,
          exitDate: current.date,
          exitPrice: current.close,
          quantity: openPos.quantity,
          pnl: (current.close - openPos.entryPrice) * openPos.quantity,
          exitReason: sell.reason,
          signalScore: openPos.signalScore,
          signalReasons: openPos.signalReasons
        })
        openPos = null
      }
    }

    // 買い判定（ポジションがない場合）
    if (!openPos) {
      const buy = calculateBuySignal(sorted, sortedInd, i)
      if (buy.isBuyCandidate) {
        openPos = {
          entryDate: current.date,
          entryPrice: current.close,
          quantity: 100,
          signalScore: buy.score,
          signalReasons: buy.reasons,
          entryIndex: i
        }
      }
    }
  }

  return { trades, openPosition: openPos }
}

import { PriceHistory, Indicator } from '@/types'

function sma(values: number[], index: number, period: number): number | null {
  if (index < period - 1) return null
  let sum = 0
  for (let i = index - period + 1; i <= index; i++) sum += values[i]
  return sum / period
}

export function calculateIndicators(
  priceHistory: PriceHistory[]
): Omit<Indicator, 'id' | 'stock_code'>[] {
  const sorted = [...priceHistory].sort((a, b) => a.date.localeCompare(b.date))
  const closes = sorted.map(p => Number(p.close))
  const volumes = sorted.map(p => Number(p.volume))
  const highs = sorted.map(p => Number(p.high))

  return sorted.map((price, i) => {
    const ma5 = sma(closes, i, 5)
    const ma25 = sma(closes, i, 25)
    const ma75 = sma(closes, i, 75)
    const vol5avg = sma(volumes, i, 5)

    // 20日高値（当日を除いた過去20日）
    const high20 = i >= 20 ? Math.max(...highs.slice(i - 20, i)) : null

    return { date: price.date, ma5, ma25, ma75, vol5avg, high20 }
  })
}

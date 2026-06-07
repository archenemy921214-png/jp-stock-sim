import { PriceHistory, Indicator } from '@/types'

function sma(values: number[], index: number, period: number): number | null {
  if (index < period - 1) return null
  let sum = 0
  for (let i = index - period + 1; i <= index; i++) sum += values[i]
  return sum / period
}

function emaArray(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period) return result
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  result[period - 1] = sum / period
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1]! * (1 - k)
  }
  return result
}

export function calcRsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain += Math.max(diff, 0)
    avgLoss += Math.max(-diff, 0)
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

export function calcMacd(closes: number[]): {
  line: (number | null)[]
  signal: (number | null)[]
  hist: (number | null)[]
} {
  const ema12 = emaArray(closes, 12)
  const ema26 = emaArray(closes, 26)
  const line: (number | null)[] = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i]! - ema26[i]! : null
  )
  const signal: (number | null)[] = new Array(closes.length).fill(null)
  const hist: (number | null)[] = new Array(closes.length).fill(null)
  const firstIdx = line.findIndex(v => v !== null)
  if (firstIdx < 0) return { line, signal, hist }
  const macdValues = line.slice(firstIdx).map(v => v ?? 0)
  const sig9 = emaArray(macdValues, 9)
  for (let i = 0; i < sig9.length; i++) {
    const idx = firstIdx + i
    if (sig9[i] !== null && line[idx] !== null) {
      signal[idx] = sig9[i]
      hist[idx] = line[idx]! - sig9[i]!
    }
  }
  return { line, signal, hist }
}

export function calculateIndicators(
  priceHistory: PriceHistory[]
): Omit<Indicator, 'id' | 'stock_code'>[] {
  const sorted = [...priceHistory].sort((a, b) => a.date.localeCompare(b.date))
  const closes = sorted.map(p => Number(p.close))
  const highs = sorted.map(p => Number(p.high))
  const lows = sorted.map(p => Number(p.low))
  const volumes = sorted.map(p => Number(p.volume))

  const rsi14Arr = calcRsi(closes)
  const { line: macdLine, signal: macdSignal, hist: macdHist } = calcMacd(closes)

  // Wilder's ATR14
  const trueRanges = sorted.map((_, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
  })
  const atr14Arr = emaArray(trueRanges, 14)

  return sorted.map((price, i) => {
    const ma5 = sma(closes, i, 5)
    const ma25 = sma(closes, i, 25)
    const ma75 = sma(closes, i, 75)
    const vol5avg = sma(volumes, i, 5)
    const high20 = i >= 20 ? Math.max(...highs.slice(i - 20, i)) : null

    // Bollinger Bands (20期間, 2σ)
    let bb_upper: number | null = null
    let bb_middle: number | null = null
    let bb_lower: number | null = null
    if (i >= 19) {
      const window = closes.slice(i - 19, i + 1)
      const mean = window.reduce((a, b) => a + b, 0) / 20
      const std = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / 20)
      bb_middle = mean
      bb_upper = mean + 2 * std
      bb_lower = mean - 2 * std
    }

    const round4 = (v: number | null) => v !== null ? parseFloat(v.toFixed(4)) : null
    const round2 = (v: number | null) => v !== null ? parseFloat(v.toFixed(2)) : null

    return {
      date: price.date,
      ma5,
      ma25,
      ma75,
      vol5avg,
      high20,
      rsi14: round2(rsi14Arr[i]),
      macd_line: round4(macdLine[i]),
      macd_signal: round4(macdSignal[i]),
      macd_hist: round4(macdHist[i]),
      bb_upper: round2(bb_upper),
      bb_middle: round2(bb_middle),
      bb_lower: round2(bb_lower),
      atr14: round2(atr14Arr[i]),
    }
  })
}

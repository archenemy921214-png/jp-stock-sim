import { PriceHistory, Indicator } from '@/types'

export interface BuySignalResult {
  score: number
  reasons: string[]
  isBuyCandidate: boolean
}

export interface SellSignalResult {
  shouldSell: boolean
  reason: string
}

export function calculateBuySignal(
  sorted: PriceHistory[],
  sortedIndicators: Indicator[],
  index: number
): BuySignalResult {
  const current = sorted[index]
  const prev = sorted[index - 1]
  const ind = sortedIndicators[index]
  const prevInd = sortedIndicators[index - 1]

  if (!current || !ind || !prev || !prevInd) {
    return { score: 0, reasons: [], isBuyCandidate: false }
  }

  let score = 0
  const reasons: string[] = []

  // 1. 終値が25日線より上（15点）
  if (ind.ma25 !== null && current.close > ind.ma25) {
    score += 15
    reasons.push(`終値(${current.close.toLocaleString()})が25日線(${Math.round(ind.ma25).toLocaleString()})を上回る`)
  }

  // 2. 25日線が上向き（10点）
  if (ind.ma25 !== null && prevInd.ma25 !== null && ind.ma25 > prevInd.ma25) {
    score += 10
    reasons.push('25日移動平均線が上向き')
  }

  // 3. 75日線が上向き（10点）
  if (ind.ma75 !== null && prevInd.ma75 !== null && ind.ma75 > prevInd.ma75) {
    score += 10
    reasons.push('75日移動平均線が上向き')
  }

  // 4. 出来高が5日平均を上回る（15点）
  if (ind.vol5avg !== null && current.volume > ind.vol5avg) {
    score += 15
    reasons.push(`出来高(${current.volume.toLocaleString()})が5日平均(${Math.round(ind.vol5avg).toLocaleString()})を上回る`)
  }

  // 5. 20日高値を上抜け（15点）
  if (ind.high20 !== null && current.close > ind.high20) {
    score += 15
    reasons.push(`終値が直近20日高値(${Math.round(ind.high20).toLocaleString()})を上抜け`)
  }

  // 6. 急騰していない（5点）
  const fiveDayAgo = sorted[index - 5]
  if (fiveDayAgo) {
    const rise5 = ((current.close - fiveDayAgo.close) / fiveDayAgo.close) * 100
    if (rise5 < 10) {
      score += 5
      reasons.push(`5日騰落率 ${rise5.toFixed(1)}%（急騰なし）`)
    } else {
      reasons.push(`5日騰落率 ${rise5.toFixed(1)}%（急騰のため加点なし）`)
    }
  }

  // 7. RSI 40-70の適正範囲（20点）— 過熱・過売を除外
  if (ind.rsi14 !== null) {
    if (ind.rsi14 >= 40 && ind.rsi14 <= 70) {
      score += 20
      reasons.push(`RSI(${ind.rsi14.toFixed(1)})が適正範囲(40-70)`)
    } else if (ind.rsi14 > 70) {
      reasons.push(`RSI(${ind.rsi14.toFixed(1)})が過熱圏(>70)—加点なし`)
    } else {
      reasons.push(`RSI(${ind.rsi14.toFixed(1)})が低水準(<40)—加点なし`)
    }
  }

  // 8. MACDがシグナル線上方かつヒストグラム拡大（最大20点）
  if (ind.macd_line !== null && ind.macd_signal !== null &&
      prevInd.macd_line !== null && prevInd.macd_signal !== null) {
    const bullish = ind.macd_line > ind.macd_signal
    const histExpanding = ind.macd_hist !== null && prevInd.macd_hist !== null &&
      ind.macd_hist > prevInd.macd_hist && ind.macd_hist > 0
    if (bullish && histExpanding) {
      score += 20
      reasons.push('MACDがシグナル線上方でヒストグラム拡大（強気モメンタム）')
    } else if (bullish) {
      score += 10
      reasons.push('MACDがシグナル線上方（強気）')
    } else {
      reasons.push('MACDがシグナル線下方（弱気）—加点なし')
    }
  }

  // 9. 終値がBBミドル以上（10点）
  if (ind.bb_middle !== null && current.close >= ind.bb_middle) {
    score += 10
    reasons.push(`終値(${current.close.toLocaleString()})がBBミドル(${Math.round(ind.bb_middle).toLocaleString()})以上`)
  }

  // 最大スコア120、85点以上を買い候補
  return { score, reasons, isBuyCandidate: score >= 85 }
}

export function checkSellCondition(
  current: PriceHistory,
  ind: Indicator,
  entryPrice: number,
  holdingDays: number,
  prevInd?: Indicator | null,
): SellSignalResult {
  const returnRate = ((current.close - entryPrice) / entryPrice) * 100

  if (returnRate <= -3) {
    return { shouldSell: true, reason: `損切り（損益率 ${returnRate.toFixed(2)}%）` }
  }
  if (returnRate >= 6) {
    return { shouldSell: true, reason: `利確（損益率 +${returnRate.toFixed(2)}%）` }
  }
  if (holdingDays >= 20) {
    return { shouldSell: true, reason: `保有${holdingDays}日経過による自動決済` }
  }
  // RSI過熱による利確
  if (ind.rsi14 !== null && ind.rsi14 > 78) {
    return { shouldSell: true, reason: `RSI過熱(${ind.rsi14.toFixed(1)})による利益確定` }
  }
  // MACDデッドクロス
  if (prevInd &&
      ind.macd_line !== null && ind.macd_signal !== null &&
      prevInd.macd_line !== null && prevInd.macd_signal !== null &&
      prevInd.macd_line > prevInd.macd_signal && ind.macd_line <= ind.macd_signal) {
    return { shouldSell: true, reason: 'MACDデッドクロス（下落転換シグナル）' }
  }
  if (ind.ma5 !== null && current.close < ind.ma5) {
    return { shouldSell: true, reason: `終値(${current.close})が5日線(${Math.round(ind.ma5)})を下回る` }
  }
  if (ind.ma25 !== null && current.close < ind.ma25) {
    return { shouldSell: true, reason: `終値(${current.close})が25日線(${Math.round(ind.ma25)})を下回る` }
  }

  return { shouldSell: false, reason: '' }
}

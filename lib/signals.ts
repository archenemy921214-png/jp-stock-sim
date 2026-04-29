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

  // 1. 終値が25日線より上（20点）
  if (ind.ma25 !== null && current.close > ind.ma25) {
    score += 20
    reasons.push(`終値(${current.close.toLocaleString()})が25日線(${Math.round(ind.ma25).toLocaleString()})を上回る`)
  }

  // 2. 25日線が上向き（15点）
  if (ind.ma25 !== null && prevInd.ma25 !== null && ind.ma25 > prevInd.ma25) {
    score += 15
    reasons.push('25日移動平均線が上向き')
  }

  // 3. 75日線が上向き（15点）
  if (ind.ma75 !== null && prevInd.ma75 !== null && ind.ma75 > prevInd.ma75) {
    score += 15
    reasons.push('75日移動平均線が上向き')
  }

  // 4. 出来高が5日平均を上回る（20点）
  if (ind.vol5avg !== null && current.volume > ind.vol5avg) {
    score += 20
    reasons.push(`出来高(${current.volume.toLocaleString()})が5日平均(${Math.round(ind.vol5avg).toLocaleString()})を上回る`)
  }

  // 5. 20日高値を上抜け（20点）
  if (ind.high20 !== null && current.close > ind.high20) {
    score += 20
    reasons.push(`終値が直近20日高値(${Math.round(ind.high20).toLocaleString()})を上抜け`)
  }

  // 6. 急騰していない（10点）: 直近5日の上昇率が10%未満
  const fiveDayAgo = sorted[index - 5]
  if (fiveDayAgo) {
    const rise5 = ((current.close - fiveDayAgo.close) / fiveDayAgo.close) * 100
    if (rise5 < 10) {
      score += 10
      reasons.push(`5日騰落率 ${rise5.toFixed(1)}%（急騰なし）`)
    } else {
      reasons.push(`5日騰落率 ${rise5.toFixed(1)}%（急騰のため除外）`)
    }
  } else {
    score += 10
    reasons.push('急騰判定データ不足（条件付きクリア）')
  }

  return { score, reasons, isBuyCandidate: score >= 80 }
}

export function checkSellCondition(
  current: PriceHistory,
  ind: Indicator,
  entryPrice: number,
  holdingDays: number
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
  if (ind.ma5 !== null && current.close < ind.ma5) {
    return { shouldSell: true, reason: `終値(${current.close})が5日線(${Math.round(ind.ma5)})を下回る` }
  }
  if (ind.ma25 !== null && current.close < ind.ma25) {
    return { shouldSell: true, reason: `終値(${current.close})が25日線(${Math.round(ind.ma25)})を下回る` }
  }

  return { shouldSell: false, reason: '' }
}

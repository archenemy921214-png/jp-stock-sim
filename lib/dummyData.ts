import type { PriceHistory } from '@/types'

export type Period = '3m' | '6m' | '1y'

function seededRandom(seed: number) {
  let s = (seed ^ 0x9e3779b9) >>> 0
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    s = s >>> 0
    return s / 0xffffffff
  }
}

function seedFromCode(code: string): number {
  return code.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0)
}

export function periodToDays(period: Period): number {
  return period === '3m' ? 91 : period === '6m' ? 182 : 365
}

export function generateDummyPrices(
  stockCode: string,
  period: Period,
  longMaPeriod: number = 25
): PriceHistory[] {
  const rand = seededRandom(seedFromCode(stockCode))

  const periodCalDays = periodToDays(period)
  const bufferDays = longMaPeriod * 2 + 60
  const totalCalDays = periodCalDays + bufferDays

  const endDate = new Date('2026-04-22')
  endDate.setHours(0, 0, 0, 0)

  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - totalCalDays)

  const basePrice = 800 + (seedFromCode(stockCode) % 3200)
  let price = basePrice * (0.8 + rand() * 0.4)

  const prices: PriceHistory[] = []
  let id = 1

  const cur = new Date(startDate)
  while (cur <= endDate) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) {
      const dailyReturn = (rand() - 0.48) * 0.022
      price = Math.max(price * (1 + dailyReturn), 50)

      const open = Math.round(price * (1 + (rand() - 0.5) * 0.012))
      const close = Math.round(price)
      const high = Math.round(Math.max(open, close) * (1 + rand() * 0.018))
      const low = Math.round(Math.min(open, close) * (1 - rand() * 0.018))
      const volume = Math.floor((rand() * 0.7 + 0.3) * 800000)

      prices.push({
        id: id++,
        stock_code: stockCode,
        date: cur.toISOString().split('T')[0],
        open,
        high,
        low,
        close,
        volume,
      })
    }
    cur.setDate(cur.getDate() + 1)
  }

  return prices
}

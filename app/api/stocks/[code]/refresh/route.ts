import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { yf } from '@/lib/yahoo'
import { calculateIndicators } from '@/lib/indicators'
import { calculateBuySignal } from '@/lib/signals'
import { runSimulation } from '@/lib/simulation'
import type { PriceHistory, Indicator } from '@/types'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const ticker = `${code}.T`

  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    startDate.setDate(startDate.getDate() - 100)

    const historical = (await yf.historical(
      ticker,
      {
        period1: startDate.toISOString().split('T')[0],
        period2: endDate.toISOString().split('T')[0],
        interval: '1d'
      },
      { validateResult: false }
    )) as any[]

    if (!historical || historical.length === 0) {
      return NextResponse.json({ error: 'データが取得できませんでした' }, { status: 404 })
    }

    const priceRows = historical
      .filter((h: any) => h.open && h.high && h.low && h.close && h.volume)
      .map((h: any) => ({
        stock_code: code,
        date: (h.date instanceof Date ? h.date : new Date(h.date)).toISOString().split('T')[0],
        open: Number(h.open),
        high: Number(h.high),
        low: Number(h.low),
        close: Number(h.close),
        volume: Number(h.volume)
      }))

    const db = getDb()

    const upsertPrice = db.prepare(`
      INSERT INTO price_history (stock_code, date, open, high, low, close, volume)
      VALUES (@stock_code, @date, @open, @high, @low, @close, @volume)
      ON CONFLICT(stock_code, date) DO UPDATE SET
        open = excluded.open, high = excluded.high, low = excluded.low,
        close = excluded.close, volume = excluded.volume
    `)
    db.transaction((rows: any[]) => { for (const r of rows) upsertPrice.run(r) })(priceRows)

    const priceHistory: PriceHistory[] = priceRows.map((p: any, i: number) => ({ id: i, ...p }))
    const indicatorsRaw = calculateIndicators(priceHistory)
    const indicatorRows = indicatorsRaw.map(ind => ({ stock_code: code, ...ind }))

    const upsertIndicator = db.prepare(`
      INSERT INTO indicators (stock_code, date, ma5, ma25, ma75, vol5avg, high20)
      VALUES (@stock_code, @date, @ma5, @ma25, @ma75, @vol5avg, @high20)
      ON CONFLICT(stock_code, date) DO UPDATE SET
        ma5 = excluded.ma5, ma25 = excluded.ma25, ma75 = excluded.ma75,
        vol5avg = excluded.vol5avg, high20 = excluded.high20
    `)
    db.transaction((rows: any[]) => { for (const r of rows) upsertIndicator.run(r) })(indicatorRows)

    const sorted = [...priceHistory].sort((a, b) => a.date.localeCompare(b.date))
    const sortedInd: Indicator[] = indicatorRows
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((ind, i) => ({ id: i, ...ind }))

    const signalRows: any[] = []
    for (let i = 75; i < sorted.length; i++) {
      const buy = calculateBuySignal(sorted, sortedInd, i)
      if (buy.score > 0) {
        signalRows.push({
          stock_code: code,
          date: sorted[i].date,
          signal_type: 'buy',
          score: buy.score,
          reasons: JSON.stringify(buy.reasons)
        })
      }
    }

    if (signalRows.length > 0) {
      const upsertSignal = db.prepare(`
        INSERT INTO signals (stock_code, date, signal_type, score, reasons)
        VALUES (@stock_code, @date, @signal_type, @score, @reasons)
        ON CONFLICT(stock_code, date, signal_type) DO UPDATE SET
          score = excluded.score, reasons = excluded.reasons
      `)
      db.transaction((rows: any[]) => { for (const r of rows) upsertSignal.run(r) })(signalRows)
    }

    const { trades, openPosition } = runSimulation(priceHistory, sortedInd)

    db.prepare('DELETE FROM simulated_trades WHERE stock_code = ?').run(code)
    db.prepare('DELETE FROM simulated_positions WHERE stock_code = ?').run(code)

    const insertPos = db.prepare(`
      INSERT INTO simulated_positions
        (stock_code, entry_date, entry_price, quantity, status, signal_score, signal_reasons)
      VALUES (@stock_code, @entry_date, @entry_price, @quantity, @status, @signal_score, @signal_reasons)
    `)
    const insertTrade = db.prepare(`
      INSERT INTO simulated_trades
        (position_id, stock_code, entry_date, entry_price, exit_date, exit_price,
         quantity, pnl, exit_reason, signal_score, signal_reasons)
      VALUES (@position_id, @stock_code, @entry_date, @entry_price, @exit_date, @exit_price,
              @quantity, @pnl, @exit_reason, @signal_score, @signal_reasons)
    `)

    db.transaction(() => {
      for (const trade of trades) {
        const r = insertPos.run({
          stock_code: code,
          entry_date: trade.entryDate,
          entry_price: trade.entryPrice,
          quantity: trade.quantity,
          status: 'closed',
          signal_score: trade.signalScore,
          signal_reasons: JSON.stringify(trade.signalReasons)
        })
        insertTrade.run({
          position_id: r.lastInsertRowid,
          stock_code: code,
          entry_date: trade.entryDate,
          entry_price: trade.entryPrice,
          exit_date: trade.exitDate,
          exit_price: trade.exitPrice,
          quantity: trade.quantity,
          pnl: trade.pnl,
          exit_reason: trade.exitReason,
          signal_score: trade.signalScore,
          signal_reasons: JSON.stringify(trade.signalReasons)
        })
      }

      if (openPosition) {
        insertPos.run({
          stock_code: code,
          entry_date: openPosition.entryDate,
          entry_price: openPosition.entryPrice,
          quantity: openPosition.quantity,
          status: 'open',
          signal_score: openPosition.signalScore,
          signal_reasons: JSON.stringify(openPosition.signalReasons)
        })
      }
    })()

    return NextResponse.json({
      success: true,
      priceCount: priceRows.length,
      tradeCount: trades.length,
      hasOpenPosition: !!openPosition
    })
  } catch (e: any) {
    console.error('[refresh]', code, e)
    return NextResponse.json({ error: e.message || 'データ取得に失敗しました' }, { status: 500 })
  }
}

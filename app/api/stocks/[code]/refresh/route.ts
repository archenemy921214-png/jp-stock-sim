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
        volume: Number(h.volume),
      }))

    const sb = getDb()

    await sb.from('price_history').upsert(priceRows, { onConflict: 'stock_code,date' })

    const priceHistory: PriceHistory[] = priceRows.map((p: any, i: number) => ({ id: i, ...p }))
    const indicatorsRaw = calculateIndicators(priceHistory)
    const indicatorRows = indicatorsRaw.map(ind => ({ stock_code: code, ...ind }))

    await sb.from('indicators').upsert(indicatorRows, { onConflict: 'stock_code,date' })

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
          reasons: buy.reasons,
        })
      }
    }

    if (signalRows.length > 0) {
      await sb.from('signals').upsert(signalRows, { onConflict: 'stock_code,date,signal_type' })
    }

    const { trades, openPosition } = runSimulation(priceHistory, sortedInd)

    await sb.from('simulated_trades').delete().eq('stock_code', code)
    await sb.from('simulated_positions').delete().eq('stock_code', code)

    for (const trade of trades) {
      const { data: posData } = await sb.from('simulated_positions').insert({
        stock_code: code,
        entry_date: trade.entryDate,
        entry_price: trade.entryPrice,
        quantity: trade.quantity,
        status: 'closed',
        signal_score: trade.signalScore,
        signal_reasons: trade.signalReasons,
      }).select('id').single()

      await sb.from('simulated_trades').insert({
        position_id: posData?.id ?? null,
        stock_code: code,
        entry_date: trade.entryDate,
        entry_price: trade.entryPrice,
        exit_date: trade.exitDate,
        exit_price: trade.exitPrice,
        quantity: trade.quantity,
        pnl: trade.pnl,
        exit_reason: trade.exitReason,
        signal_score: trade.signalScore,
        signal_reasons: trade.signalReasons,
      })
    }

    if (openPosition) {
      await sb.from('simulated_positions').insert({
        stock_code: code,
        entry_date: openPosition.entryDate,
        entry_price: openPosition.entryPrice,
        quantity: openPosition.quantity,
        status: 'open',
        signal_score: openPosition.signalScore,
        signal_reasons: openPosition.signalReasons,
      })
    }

    return NextResponse.json({
      success: true,
      priceCount: priceRows.length,
      tradeCount: trades.length,
      hasOpenPosition: !!openPosition,
    })
  } catch (e: any) {
    console.error('[refresh]', code, e)
    return NextResponse.json({ error: e.message || 'データ取得に失敗しました' }, { status: 500 })
  }
}

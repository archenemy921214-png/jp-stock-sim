import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const sb = getDb()

    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const since = oneYearAgo.toISOString().split('T')[0]

    const [pricesRes, indicatorsRes, signalsRes, positionsRes, tradesRes] = await Promise.all([
      sb.from('price_history').select('*').eq('stock_code', code).gte('date', since).order('date', { ascending: true }),
      sb.from('indicators').select('*').eq('stock_code', code).gte('date', since).order('date', { ascending: true }),
      sb.from('signals').select('*').eq('stock_code', code).gte('date', since).eq('signal_type', 'buy').order('date', { ascending: true }),
      sb.from('simulated_positions').select('*').eq('stock_code', code).order('entry_date', { ascending: true }),
      sb.from('simulated_trades').select('*').eq('stock_code', code).order('exit_date', { ascending: false }),
    ])

    if (pricesRes.error) throw pricesRes.error
    if (indicatorsRes.error) throw indicatorsRes.error
    if (signalsRes.error) throw signalsRes.error
    if (positionsRes.error) throw positionsRes.error
    if (tradesRes.error) throw tradesRes.error

    return NextResponse.json({
      prices: pricesRes.data ?? [],
      indicators: indicatorsRes.data ?? [],
      signals: signalsRes.data ?? [],
      positions: positionsRes.data ?? [],
      trades: tradesRes.data ?? [],
    })
  } catch (e: any) {
    console.error('[GET /api/stocks/[code]/data]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

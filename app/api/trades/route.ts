import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const sb = getDb()

    // JOIN不要：個別クエリ＋メモリ結合
    const [tradesRes, stocksRes] = await Promise.all([
      code
        ? sb.from('simulated_trades').select('*').eq('stock_code', code).order('exit_date', { ascending: false })
        : sb.from('simulated_trades').select('*').order('exit_date', { ascending: false }),
      sb.from('stocks').select('code, name'),
    ])

    if (tradesRes.error) throw tradesRes.error
    if (stocksRes.error) throw stocksRes.error

    const stockMap = Object.fromEntries((stocksRes.data ?? []).map(s => [s.code, s.name]))
    const trades = (tradesRes.data ?? []).map(t => ({
      ...t,
      stocks: { name: stockMap[t.stock_code] ?? t.stock_code },
    }))

    return NextResponse.json(trades)
  } catch (e: any) {
    console.error('[GET /api/trades]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

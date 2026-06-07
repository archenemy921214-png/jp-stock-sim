import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserId } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const userId = await getUserId()
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const sb = getDb()

    const tradesQuery = code
      ? sb.from('simulated_trades').select('*').eq('stock_code', code).eq('user_id', userId).order('exit_date', { ascending: false })
      : sb.from('simulated_trades').select('*').eq('user_id', userId).order('exit_date', { ascending: false })

    const [tradesRes, stocksRes] = await Promise.all([
      tradesQuery,
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
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[GET /api/trades]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const userId = await getUserId()
    const sb = getDb()
    await Promise.all([
      sb.from('simulated_trades').delete().eq('user_id', userId),
      sb.from('simulated_positions').delete().eq('user_id', userId),
    ])
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

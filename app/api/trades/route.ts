import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const sb = getDb()

    let query = sb
      .from('simulated_trades')
      .select('*, stocks(name)')
      .order('exit_date', { ascending: false })

    if (code) query = query.eq('stock_code', code)

    const { data: trades, error } = await query
    if (error) throw error
    return NextResponse.json(trades ?? [])
  } catch (e: any) {
    console.error('[GET /api/trades]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

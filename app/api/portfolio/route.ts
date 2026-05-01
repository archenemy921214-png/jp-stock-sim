import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const sb = getDb()

    const [portRes, posRes, tradesRes] = await Promise.all([
      sb.from('claude_portfolio').select('*').eq('id', 1).single(),
      sb.from('claude_positions').select('*').eq('status', 'open').order('entry_date', { ascending: true }),
      sb.from('claude_trades').select('*').order('date', { ascending: false }).limit(100),
    ])

    if (portRes.error && portRes.error.code !== 'PGRST116') throw portRes.error
    if (posRes.error) throw posRes.error
    if (tradesRes.error) throw tradesRes.error

    const portfolio = portRes.data
    const positions = posRes.data ?? []
    const trades = tradesRes.data ?? []

    const enrichedPositions = await Promise.all(positions.map(async pos => {
      const { data: latest } = await sb
        .from('price_history')
        .select('close')
        .eq('stock_code', pos.stock_code)
        .order('date', { ascending: false })
        .limit(1)
        .single()
      const currentPrice = Number(latest?.close ?? pos.entry_price)
      const currentValue = currentPrice * pos.quantity
      const unrealizedPnl = (currentPrice - Number(pos.entry_price)) * pos.quantity
      return { ...pos, current_price: currentPrice, current_value: currentValue, unrealized_pnl: unrealizedPnl }
    }))

    const positionsValue = enrichedPositions.reduce((s, p) => s + p.current_value, 0)
    const totalValue = Number(portfolio?.cash ?? 1000000) + positionsValue
    const realizedPnl = trades.filter(t => t.trade_type === 'sell').reduce((s, t) => s + Number(t.pnl ?? 0), 0)

    return NextResponse.json({
      cash: portfolio?.cash ?? 1000000,
      positions: enrichedPositions,
      trades,
      totalValue,
      realizedPnl,
      initialCapital: 1000000,
    })
  } catch (e: any) {
    console.error('[GET /api/portfolio]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json()
    const sb = getDb()

    if (action === 'reset') {
      await sb.from('claude_trades').delete().neq('id', 0)
      await sb.from('claude_positions').delete().neq('id', 0)
      await sb.from('claude_portfolio').upsert({ id: 1, cash: 1000000 })
      return NextResponse.json({ success: true, message: 'ポートフォリオをリセットしました' })
    }

    return NextResponse.json({ error: '不明なアクション' }, { status: 400 })
  } catch (e: any) {
    console.error('[POST /api/portfolio]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

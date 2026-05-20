import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserId } from '@/lib/auth'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

export async function GET() {
  try {
    const userId = await getUserId()
    const sb = getDb()

    const { data: watchlist, error: wErr } = await sb
      .from('user_watchlist')
      .select('stock_code, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (wErr) throw wErr

    if (!watchlist || watchlist.length === 0) return NextResponse.json([])

    const codes = watchlist.map(w => w.stock_code)
    const { data: stocks, error } = await sb.from('stocks').select('*').in('code', codes)
    if (error) throw error

    const createdAtMap = Object.fromEntries(watchlist.map(w => [w.stock_code, w.created_at]))
    const result = (stocks ?? [])
      .sort((a, b) => createdAtMap[b.code] > createdAtMap[a.code] ? 1 : -1)
      .map(s => ({ ...s, name: masterMap[String(s.code)] || s.name }))

    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[GET /api/stocks] error:', e?.message, e?.code, e?.details)
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error', code: e?.code, details: e?.details },
      { status: 500 }
    )
  }
}

const MAX_STOCKS = 9

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const { code, name: providedName } = await request.json()
    if (!code) return NextResponse.json({ error: '銘柄コードを入力してください' }, { status: 400 })

    const sb = getDb()

    const { count } = await sb
      .from('user_watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    if ((count ?? 0) >= MAX_STOCKS) {
      return NextResponse.json({ error: `銘柄は最大${MAX_STOCKS}個までです` }, { status: 400 })
    }

    let name = masterMap[String(code)] || providedName
    if (!name) {
      const ticker = `${code}.T`
      const quote = await yf.quote(ticker, {}, { validateResult: false })
      name = (quote as any).longName || (quote as any).shortName || code
    }

    // stocks は共有キャッシュなので upsert
    const { data: stock, error: stockErr } = await sb
      .from('stocks')
      .upsert({ code: String(code), name, exchange: 'TSE' }, { onConflict: 'code' })
      .select()
      .single()
    if (stockErr) throw stockErr

    // ユーザーのウォッチリストに追加
    const { error: wErr } = await sb
      .from('user_watchlist')
      .insert({ user_id: userId, stock_code: String(code) })
    if (wErr) {
      if (wErr.code === '23505') {
        return NextResponse.json({ error: 'この銘柄はすでに登録されています' }, { status: 409 })
      }
      throw wErr
    }

    return NextResponse.json(stock)
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[POST /api/stocks] error:', e?.message, e?.code)
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error', code: e?.code },
      { status: 500 }
    )
  }
}

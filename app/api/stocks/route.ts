import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

export async function GET() {
  try {
    const sb = getDb()
    const { data: stocks, error } = await sb
      .from('stocks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    const result = (stocks ?? []).map((s: any) => ({
      ...s,
      name: masterMap[String(s.code)] || s.name,
    }))
    return NextResponse.json(result)
  } catch (e: any) {
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
    const { code, name: providedName } = await request.json()
    if (!code) return NextResponse.json({ error: '銘柄コードを入力してください' }, { status: 400 })

    const sb = getDb()
    const { count } = await sb.from('stocks').select('*', { count: 'exact', head: true })
    if ((count ?? 0) >= MAX_STOCKS) {
      return NextResponse.json({ error: `銘柄は最大${MAX_STOCKS}個までです` }, { status: 400 })
    }

    let name = masterMap[String(code)] || providedName
    if (!name) {
      const ticker = `${code}.T`
      const quote = await yf.quote(ticker, {}, { validateResult: false })
      name = (quote as any).longName || (quote as any).shortName || code
    }

    const { data, error } = await sb
      .from('stocks')
      .insert({ code: String(code), name, exchange: 'TSE' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'この銘柄はすでに登録されています' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[POST /api/stocks] error:', e?.message, e?.code)
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error', code: e?.code },
      { status: 500 }
    )
  }
}

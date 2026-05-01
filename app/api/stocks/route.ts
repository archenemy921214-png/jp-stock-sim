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
    return NextResponse.json(stocks ?? [])
  } catch (e: any) {
    console.error('[GET /api/stocks]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    if (!code) return NextResponse.json({ error: '銘柄コードを入力してください' }, { status: 400 })

    const ticker = `${code}.T`
    const quote = await yf.quote(ticker, {}, { validateResult: false })
    const name = masterMap[String(code)] || (quote as any).longName || (quote as any).shortName || code

    const sb = getDb()
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
    console.error('[POST /api/stocks]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

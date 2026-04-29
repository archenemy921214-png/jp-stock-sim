import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

export async function GET() {
  const sb = getDb()
  const { data: stocks, error } = await sb
    .from('stocks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(stocks)
}

export async function POST(request: Request) {
  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: '銘柄コードを入力してください' }, { status: 400 })

  const ticker = `${code}.T`
  try {
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: `銘柄が見つかりません: ${e.message}` }, { status: 404 })
  }
}

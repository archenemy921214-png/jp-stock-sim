import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

export async function GET() {
  const db = getDb()
  const stocks = db.prepare('SELECT * FROM stocks ORDER BY created_at DESC').all()
  return NextResponse.json(stocks)
}

export async function POST(request: Request) {
  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: '銘柄コードを入力してください' }, { status: 400 })

  const ticker = `${code}.T`

  try {
    const quote = await yf.quote(ticker, {}, { validateResult: false })
    const name = masterMap[String(code)] || (quote as any).longName || (quote as any).shortName || code

    const db = getDb()
    try {
      db.prepare('INSERT INTO stocks (code, name, exchange) VALUES (?, ?, ?)').run(String(code), name, 'TSE')
      const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(String(code))
      return NextResponse.json(stock)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'この銘柄はすでに登録されています' }, { status: 409 })
      }
      throw e
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: `銘柄が見つかりません: ${e.message}` },
      { status: 404 }
    )
  }
}

import { NextResponse } from 'next/server'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

function isJapanese(str: string) {
  return /[　-鿿＀-￯]/.test(str)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  // 日本語クエリはローカルマスターから検索
  if (isJapanese(q)) {
    const results = stocksMaster
      .filter(s => s.name.includes(q))
      .slice(0, 8)
    return NextResponse.json(results)
  }

  // 英数字クエリはYahoo Finance検索
  try {
    const result = await yf.search(q, {}, { validateResult: false }) as any
    const quotes = (result.quotes ?? [])
      .filter((r: any) => r.exchange === 'JPX' || r.symbol?.endsWith('.T'))
      .slice(0, 8)
      .map((r: any) => {
        const code = r.symbol?.replace('.T', '')
        return { code, name: masterMap[code] || r.shortname || r.longname || r.symbol }
      })
    return NextResponse.json(quotes)
  } catch {
    return NextResponse.json([])
  }
}

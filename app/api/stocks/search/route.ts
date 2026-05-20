import { NextResponse } from 'next/server'
import { yf } from '@/lib/yahoo'
import stocksMaster from '@/data/stocks_master.json'

const masterMap: Record<string, string> = Object.fromEntries(
  (stocksMaster as { code: string; name: string }[]).map(s => [s.code, s.name])
)

function isJapanese(str: string) {
  return /[　-鿿＀-￯]/.test(str)
}

function toKatakana(str: string) {
  return str.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

// クエリをスライドしながら名前と比較し最良スコアを返す
function windowScore(query: string, name: string): number {
  if (name.startsWith(query)) return 3.0  // 前方一致（最優先）
  if (name.includes(query)) return 2.0    // 部分一致
  const qLen = query.length
  if (qLen > name.length) return 0
  const maxDist = Math.max(1, Math.floor(qLen / 2))
  let best = 0
  for (let i = 0; i <= name.length - qLen; i++) {
    const dist = editDistance(query, name.slice(i, i + qLen))
    if (dist <= maxDist) {
      // 先頭に近いほど・誤りが少ないほど高スコア
      const score = (1 - dist / (maxDist + 1)) * (1 - (i / name.length) * 0.3)
      if (score > best) best = score
    }
  }
  return best
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  // 日本語クエリ：ひらがな→カタカナ変換してウィンドウ編集距離でファジー検索
  if (isJapanese(q)) {
    const qKana = toKatakana(q)
    const results = stocksMaster
      .map(s => ({ s, score: Math.max(windowScore(q, s.name), windowScore(qKana, s.name)) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.s.name.length - b.s.name.length)
      .slice(0, 8)
      .map(({ s }) => s)
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

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { yf } from '@/lib/yahoo'
import { calcRsi, calcMacd } from '@/lib/indicators'
import nikkei225 from '@/data/nikkei225_top.json'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET() {
  const sb = getDb()
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const { data } = await sb.from('daily_picks').select('*').eq('date', today).maybeSingle()
  return NextResponse.json(data ?? null)
}

interface QuoteStock {
  code: string
  name: string
  price: number
  changePercent: number
  volume: number
  volumeRatio: number
  week52High: number
  week52Low: number
  positionIn52w: number
  ma50: number | null
  ma200: number | null
}

interface EnrichedStock extends QuoteStock {
  rsi14: number | null
  macdBullish: boolean | null
  macdHist: number | null
  bbPosition: number | null
  trend5d: number | null
  trend20d: number | null
  atr14: number | null
}

async function fetchTechnicals(code: string): Promise<{
  rsi14: number | null
  macdBullish: boolean | null
  macdHist: number | null
  bbPosition: number | null
  trend5d: number | null
  trend20d: number | null
  atr14: number | null
}> {
  const empty = { rsi14: null, macdBullish: null, macdHist: null, bbPosition: null, trend5d: null, trend20d: null, atr14: null }
  try {
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 4)
    const hist = await yf.historical(`${code}.T`, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d',
    }, { validateResult: false }) as any[]

    if (!hist || hist.length < 30) return empty

    const closes = hist.map((h: any) => Number(h.close)).filter((c: number) => !isNaN(c))
    if (closes.length < 26) return empty

    const rsiArr = calcRsi(closes)
    const { line, signal, hist: macdHistArr } = calcMacd(closes)
    const last = closes.length - 1

    const rsi14 = rsiArr[last] !== null ? parseFloat(rsiArr[last]!.toFixed(1)) : null
    const macdLine = line[last]
    const macdSig = signal[last]
    const macdH = macdHistArr[last]
    const macdBullish = macdLine !== null && macdSig !== null ? macdLine > macdSig : null
    const macdHist = macdH !== null ? parseFloat(macdH.toFixed(4)) : null

    // Bollinger Bands (20期間)
    let bbPosition: number | null = null
    if (closes.length >= 20) {
      const window = closes.slice(last - 19, last + 1)
      const mean = window.reduce((a: number, b: number) => a + b, 0) / 20
      const std = Math.sqrt(window.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / 20)
      if (std > 0) {
        bbPosition = Math.round(((closes[last] - (mean - 2 * std)) / (4 * std)) * 100)
      }
    }

    // ATR14 (簡易計算)
    const trueRanges = hist.map((h: any, i: number) => {
      if (i === 0) return Number(h.high) - Number(h.low)
      const prev = Number(hist[i - 1].close)
      return Math.max(Number(h.high) - Number(h.low), Math.abs(Number(h.high) - prev), Math.abs(Number(h.low) - prev))
    })
    const atrSlice = trueRanges.slice(Math.max(0, last - 13), last + 1)
    const atr14 = parseFloat((atrSlice.reduce((a: number, b: number) => a + b, 0) / atrSlice.length).toFixed(2))

    const trend5d = closes.length >= 6
      ? parseFloat((((closes[last] - closes[last - 5]) / closes[last - 5]) * 100).toFixed(2))
      : null
    const trend20d = closes.length >= 21
      ? parseFloat((((closes[last] - closes[last - 20]) / closes[last - 20]) * 100).toFixed(2))
      : null

    return { rsi14, macdBullish, macdHist, bbPosition, trend5d, trend20d, atr14 }
  } catch {
    return empty
  }
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const sb = getDb()
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

  const { data: existing } = await sb.from('daily_picks').select('*').eq('date', today).maybeSingle()
  if (existing) return NextResponse.json(existing)

  // Step1: 全銘柄のリアルタイムquote取得
  const quoteResults = await Promise.allSettled(
    nikkei225.map(async (stock) => {
      const ticker = `${stock.code}.T`
      const quote = await yf.quote(ticker, {}, { validateResult: false }) as any
      if (!quote || !quote.regularMarketPrice) return null

      const price = Number(quote.regularMarketPrice)
      const changePercent = Number(quote.regularMarketChangePercent ?? 0)
      const volume = Number(quote.regularMarketVolume ?? 0)
      const avgVolume = Number(quote.averageDailyVolume3Month ?? quote.averageVolume ?? 1)
      const week52High = Number(quote.fiftyTwoWeekHigh ?? price)
      const week52Low = Number(quote.fiftyTwoWeekLow ?? price)
      const positionIn52w = week52High > week52Low
        ? Math.round(((price - week52Low) / (week52High - week52Low)) * 100)
        : 50
      const ma50 = quote.fiftyDayAverage ? Number(quote.fiftyDayAverage) : null
      const ma200 = quote.twoHundredDayAverage ? Number(quote.twoHundredDayAverage) : null

      return {
        code: stock.code,
        name: stock.name,
        price,
        changePercent: parseFloat(changePercent.toFixed(2)),
        volume,
        volumeRatio: avgVolume > 0 ? parseFloat((volume / avgVolume).toFixed(2)) : 1,
        week52High,
        week52Low,
        positionIn52w,
        ma50,
        ma200,
      } as QuoteStock
    })
  )

  const validStocks = quoteResults
    .filter((r): r is PromiseFulfilledResult<QuoteStock> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)

  if (validStocks.length === 0) {
    return NextResponse.json({ error: '株価データの取得に失敗しました' }, { status: 500 })
  }

  // Step2: 予備スコアで上位20銘柄を絞り込んで詳細テクニカルを取得
  const candidates = validStocks
    .map(s => ({
      ...s,
      preScore:
        (s.changePercent > 0 ? s.changePercent * 2 : s.changePercent) +
        (s.volumeRatio > 1 ? Math.min(s.volumeRatio - 1, 2) * 10 : 0) +
        (s.ma50 !== null && s.price > s.ma50 ? 5 : 0) +
        (s.positionIn52w >= 70 ? 5 : s.positionIn52w <= 20 ? 3 : 0),
    }))
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, 20)

  // Step3: 上位20銘柄の詳細テクニカル取得（並列）
  const enrichedResults = await Promise.allSettled(
    candidates.map(async s => {
      const tech = await fetchTechnicals(s.code)
      return { ...s, ...tech }
    })
  )

  const enriched = enrichedResults
    .filter((r): r is PromiseFulfilledResult<EnrichedStock & { preScore: number }> => r.status === 'fulfilled')
    .map(r => r.value)

  // Step4: テクニカルスコアで最終ランク付け（RSI・MACDを反映）
  const ranked = enriched.map(s => {
    let techScore = s.preScore
    if (s.rsi14 !== null) {
      if (s.rsi14 >= 40 && s.rsi14 <= 68) techScore += 15
      else if (s.rsi14 > 75) techScore -= 20
    }
    if (s.macdBullish === true) techScore += 10
    if (s.macdHist !== null && s.macdHist > 0) techScore += 5
    if (s.bbPosition !== null && s.bbPosition >= 50 && s.bbPosition <= 80) techScore += 8
    if (s.trend20d !== null && s.trend20d > 0 && s.trend20d < 15) techScore += 5
    return { ...s, techScore }
  }).sort((a, b) => b.techScore - a.techScore)

  const stockLines = ranked.map(s => {
    const rsiStr = s.rsi14 !== null ? `RSI=${s.rsi14}` : 'RSI=N/A'
    const macdStr = s.macdBullish !== null ? (s.macdBullish ? 'MACD強気' : 'MACD弱気') : 'MACD=N/A'
    const bbStr = s.bbPosition !== null ? `BB位置=${s.bbPosition}%` : 'BB=N/A'
    const ma50str = s.ma50 !== null ? (s.price > s.ma50 ? 'MA50上' : 'MA50下') : ''
    const trend5str = s.trend5d !== null ? `5日${s.trend5d >= 0 ? '+' : ''}${s.trend5d}%` : ''
    const trend20str = s.trend20d !== null ? `20日${s.trend20d >= 0 ? '+' : ''}${s.trend20d}%` : ''
    return `[${s.code}] ${s.name}: ¥${s.price.toLocaleString()} 前日比${s.changePercent >= 0 ? '+' : ''}${s.changePercent}% 出来高比${s.volumeRatio}倍 52週位置${s.positionIn52w}% | ${rsiStr} ${macdStr} ${bbStr} ${ma50str} ${trend5str} ${trend20str}`
  }).join('\n')

  const prompt = `あなたは日本株の投資アドバイザーです。以下の日経225主要${ranked.length}銘柄のデータを分析し、本日最も値上がりが期待できる1銘柄を選んでください。

【本日の株価・テクニカルデータ（${today}）】
${stockLines}

【指標の見方】
- RSI: 40-68が適正（70超=過熱で避ける, 35未満=下落トレンド）
- MACD強気: MACDがシグナル線上方（上昇モメンタム継続）
- BB位置: 50-80%が強気ゾーン（0%=下限, 100%=上限）
- 出来高比: 1.5倍以上は機関投資家の注目あり
- MA50上: 中期上昇トレンド内

【選定基準の優先順位】
1. RSIが40-68で上昇中（過熱していない健全な上昇）
2. MACD強気かつヒストグラムが拡大（モメンタム加速）
3. BB位置50-80%（上昇トレンド内の適正位置）
4. 出来高が平均の1.5倍以上（注目度が高い）
5. MA50より上で5日・20日ともプラス推移

必ず以下のJSON形式のみで回答してください（他の文字は一切不要）:
{"code":"銘柄コード","name":"銘柄名","predictedChange":予想上昇率（%、小数点1桁の数値）,"reasoning":"選定理由（日本語180字以内、RSI・MACDの根拠を含める）","confidence":確信度0から100の整数}`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI応答のパースに失敗しました' }, { status: 500 })

    const pick = JSON.parse(jsonMatch[0]) as {
      code: string
      name: string
      predictedChange: number
      reasoning: string
      confidence: number
    }

    const { data: saved, error: insertErr } = await sb
      .from('daily_picks')
      .insert({
        date: today,
        stock_code: pick.code,
        stock_name: pick.name,
        reasoning: pick.reasoning,
        predicted_change: pick.predictedChange,
        confidence: pick.confidence,
      })
      .select()
      .single()

    if (insertErr) throw insertErr
    return NextResponse.json(saved)
  } catch (e: any) {
    console.error('[POST /api/daily-pick]', e)
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 })
  }
}

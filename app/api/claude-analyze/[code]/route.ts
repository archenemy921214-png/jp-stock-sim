import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb, parseReasons } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const sb = getDb()

  const { data: stock } = await sb.from('stocks').select('*').eq('code', code).single()
  if (!stock) return NextResponse.json({ error: '銘柄が見つかりません' }, { status: 404 })

  const [pricesRes, latestIndRes, latestSignalRes, portfolioRes, openPosRes] = await Promise.all([
    sb.from('price_history').select('*').eq('stock_code', code).order('date', { ascending: false }).limit(30),
    sb.from('indicators').select('*').eq('stock_code', code).order('date', { ascending: false }).limit(1).single(),
    sb.from('signals').select('*').eq('stock_code', code).eq('signal_type', 'buy').order('date', { ascending: false }).limit(1).single(),
    sb.from('claude_portfolio').select('*').eq('id', 1).single(),
    sb.from('claude_positions').select('*').eq('stock_code', code).eq('status', 'open').limit(1).single(),
  ])

  const prices = pricesRes.data ?? []
  const latestInd = latestIndRes.data
  const latestSignal = latestSignalRes.data
  const portfolio = portfolioRes.data
  const openPos = openPosRes.data

  const cash = Number(portfolio?.cash ?? 1000000)
  const latestPrice = prices[0] ? Number(prices[0].close) : 0
  const priceTable = [...prices].reverse()
    .map(p => `${p.date}: 終値¥${Number(p.close).toLocaleString()} 出来高${Number(p.volume).toLocaleString()}`)
    .join('\n')

  const signalReasons = latestSignal ? parseReasons(latestSignal.reasons) : []
  const maxInvestment = Math.floor(cash * 0.2)
  const maxQuantity = latestPrice > 0 ? Math.floor(maxInvestment / latestPrice / 100) * 100 : 0
  const suggestedQty = Math.max(100, Math.min(maxQuantity, 1000))

  const prompt = `あなたは日本株の投資判断を行うAIトレーダーです。以下のデータを分析して、投資判断を行ってください。

【銘柄情報】
銘柄コード: ${code}
銘柄名: ${stock.name}
最新終値: ¥${latestPrice.toLocaleString()}

【直近30日間の価格データ】
${priceTable}

【テクニカル指標（最新）】
5日移動平均: ${latestInd?.ma5 ? `¥${Math.round(Number(latestInd.ma5)).toLocaleString()}` : 'N/A'}
25日移動平均: ${latestInd?.ma25 ? `¥${Math.round(Number(latestInd.ma25)).toLocaleString()}` : 'N/A'}
75日移動平均: ${latestInd?.ma75 ? `¥${Math.round(Number(latestInd.ma75)).toLocaleString()}` : 'N/A'}
5日出来高平均: ${latestInd?.vol5avg ? Math.round(Number(latestInd.vol5avg)).toLocaleString() : 'N/A'}
直近20日高値: ${latestInd?.high20 ? `¥${Math.round(Number(latestInd.high20)).toLocaleString()}` : 'N/A'}

【ルールベースシグナル】
スコア: ${latestSignal?.score ?? 0}/100点（80点以上が買いシグナル）
判定根拠:
${signalReasons.length > 0 ? signalReasons.map(r => `- ${r}`).join('\n') : '- データなし'}

【現在のポートフォリオ状況】
保有現金: ¥${cash.toLocaleString()}
この銘柄の保有: ${openPos ? `${openPos.quantity}株（取得価格¥${Number(openPos.entry_price).toLocaleString()}、含み損益: ${((latestPrice - Number(openPos.entry_price)) / Number(openPos.entry_price) * 100).toFixed(2)}%）` : 'なし'}

【取引ルール】
- 最小売買単位: 100株
- 買いの場合の推奨株数: ${suggestedQty}株（最大投資額¥${maxInvestment.toLocaleString()}の範囲内）
- 損切り基準: -3%で売却
- 利確基準: +6%で売却
- 同一銘柄は1ポジションのみ

必ず以下のJSON形式のみで回答してください（他の説明文は不要）:
{"decision":"buy"|"sell"|"hold","confidence":0〜100の整数,"quantity":${suggestedQty}（買いの場合）または${openPos?.quantity ?? 0}（売りの場合）または0（holdの場合）,"reasoning":"判断理由（日本語200字以内）"}`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSONが取得できませんでした')

    const decision = JSON.parse(jsonMatch[0]) as {
      decision: 'buy' | 'sell' | 'hold'
      confidence: number
      quantity: number
      reasoning: string
    }

    const today = new Date().toISOString().split('T')[0]

    if (decision.decision === 'buy' && decision.quantity > 0 && !openPos) {
      const cost = latestPrice * decision.quantity
      if (cash >= cost) {
        await sb.from('claude_positions').insert({
          stock_code: code, stock_name: stock.name,
          entry_date: today, entry_price: latestPrice,
          quantity: decision.quantity, claude_reasoning: decision.reasoning,
        })
        await sb.from('claude_trades').insert({
          stock_code: code, stock_name: stock.name, trade_type: 'buy',
          date: today, price: latestPrice, quantity: decision.quantity,
          amount: -cost, cash_before: cash, cash_after: cash - cost,
          claude_reasoning: decision.reasoning,
        })
        await sb.from('claude_portfolio').update({ cash: cash - cost }).eq('id', 1)
      } else {
        decision.reasoning = `（資金不足のため見送り）${decision.reasoning}`
        decision.decision = 'hold'
      }
    } else if (decision.decision === 'sell' && openPos) {
      const proceeds = latestPrice * openPos.quantity
      const pnl = (latestPrice - Number(openPos.entry_price)) * openPos.quantity
      await sb.from('claude_positions').update({ status: 'closed' }).eq('id', openPos.id)
      await sb.from('claude_trades').insert({
        stock_code: code, stock_name: stock.name, trade_type: 'sell',
        date: today, price: latestPrice, quantity: openPos.quantity,
        amount: proceeds, cash_before: cash, cash_after: cash + proceeds, pnl,
        claude_reasoning: decision.reasoning,
      })
      await sb.from('claude_portfolio').update({ cash: cash + proceeds }).eq('id', 1)
    }

    return NextResponse.json({ ...decision, stock_code: code, stock_name: stock.name, latest_price: latestPrice })
  } catch (e: any) {
    console.error('[claude-analyze]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

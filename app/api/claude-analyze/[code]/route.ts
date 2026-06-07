import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb, parseReasons } from '@/lib/db'
import { getUserId } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  let userId: string
  try {
    userId = await getUserId()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getDb()

  const { data: stock } = await sb.from('stocks').select('*').eq('code', code).single()
  if (!stock) return NextResponse.json({ error: '銘柄が見つかりません' }, { status: 404 })

  // ポートフォリオが未作成なら初期化
  const { data: existingPort } = await sb
    .from('claude_portfolio')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!existingPort) {
    await sb.from('claude_portfolio').insert({
      user_id: userId,
      cash: 1000000,
      initial_capital: 1000000,
    })
  }

  const [pricesRes, latestIndRes, latestSignalRes, portfolioRes, openPosRes] = await Promise.all([
    sb.from('price_history').select('*').eq('stock_code', code).order('date', { ascending: false }).limit(30),
    sb.from('indicators').select('*').eq('stock_code', code).order('date', { ascending: false }).limit(1).single(),
    sb.from('signals').select('*').eq('stock_code', code).eq('signal_type', 'buy').order('date', { ascending: false }).limit(1).single(),
    sb.from('claude_portfolio').select('*').eq('user_id', userId).single(),
    sb.from('claude_positions').select('*').eq('stock_code', code).eq('user_id', userId).eq('status', 'open').limit(1).single(),
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

  const rsi = latestInd?.rsi14 != null ? Number(latestInd.rsi14) : null
  const macdLine = latestInd?.macd_line != null ? Number(latestInd.macd_line) : null
  const macdSig = latestInd?.macd_signal != null ? Number(latestInd.macd_signal) : null
  const macdHist = latestInd?.macd_hist != null ? Number(latestInd.macd_hist) : null
  const bbUpper = latestInd?.bb_upper != null ? Number(latestInd.bb_upper) : null
  const bbMiddle = latestInd?.bb_middle != null ? Number(latestInd.bb_middle) : null
  const bbLower = latestInd?.bb_lower != null ? Number(latestInd.bb_lower) : null
  const atr14 = latestInd?.atr14 != null ? Number(latestInd.atr14) : null

  const rsiStr = rsi !== null
    ? `${rsi.toFixed(1)}${rsi > 70 ? '（過熱圏）' : rsi < 35 ? '（売られすぎ）' : '（適正）'}`
    : 'N/A'
  const macdStr = macdLine !== null && macdSig !== null
    ? `MACD=${macdLine.toFixed(2)} / シグナル=${macdSig.toFixed(2)} / ヒスト=${macdHist?.toFixed(2) ?? 'N/A'} → ${macdLine > macdSig ? '強気（MACDがシグナル上方）' : '弱気（MACDがシグナル下方）'}`
    : 'N/A'
  const bbStr = bbUpper !== null && bbMiddle !== null && bbLower !== null
    ? `上限¥${Math.round(bbUpper).toLocaleString()} / 中心¥${Math.round(bbMiddle).toLocaleString()} / 下限¥${Math.round(bbLower).toLocaleString()} → 現在価格はBB${latestPrice > bbMiddle ? '上半分（強気ゾーン）' : '下半分（弱気ゾーン）'}`
    : 'N/A'
  const atrStr = atr14 !== null
    ? `¥${atr14.toLocaleString()}（${((atr14 / latestPrice) * 100).toFixed(2)}%）`
    : 'N/A'

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
直近20日高値: ${latestInd?.high20 ? `¥${Math.round(Number(latestInd.high20)).toLocaleString()}` : 'N/A'}
RSI(14): ${rsiStr}
MACD(12,26,9): ${macdStr}
ボリンジャーバンド(20,2σ): ${bbStr}
ATR(14)日次ボラティリティ: ${atrStr}

【ルールベースシグナル】
スコア: ${latestSignal?.score ?? 0}/120点（85点以上が買いシグナル）
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
- RSI>78は過熱売り、MACDデッドクロスは売りシグナル
- 同一銘柄は1ポジションのみ

【判断の重みづけ】
RSIとMACDの一致を重視してください。RSIが適正範囲(40-68)でMACDが強気の場合は買い寄りに、RSI過熱またはMACDが弱気に転じた場合は売り/hold寄りに判断してください。

必ず以下のJSON形式のみで回答してください（他の説明文は不要）:
{"decision":"buy"|"sell"|"hold","confidence":0〜100の整数,"quantity":${suggestedQty}（買いの場合）または${openPos?.quantity ?? 0}（売りの場合）または0（holdの場合）,"reasoning":"判断理由（日本語200字以内、RSI・MACDの根拠を含める）"}`

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
          user_id: userId,
          stock_code: code, stock_name: stock.name,
          entry_date: today, entry_price: latestPrice,
          quantity: decision.quantity, claude_reasoning: decision.reasoning,
        })
        await sb.from('claude_trades').insert({
          user_id: userId,
          stock_code: code, stock_name: stock.name, trade_type: 'buy',
          date: today, price: latestPrice, quantity: decision.quantity,
          amount: -cost, cash_before: cash, cash_after: cash - cost,
          claude_reasoning: decision.reasoning,
        })
        await sb.from('claude_portfolio').update({ cash: cash - cost }).eq('user_id', userId)
      } else {
        decision.reasoning = `（資金不足のため見送り）${decision.reasoning}`
        decision.decision = 'hold'
      }
    } else if (decision.decision === 'sell' && openPos) {
      const proceeds = latestPrice * openPos.quantity
      const pnl = (latestPrice - Number(openPos.entry_price)) * openPos.quantity
      await sb.from('claude_positions').update({ status: 'closed' }).eq('id', openPos.id).eq('user_id', userId)
      await sb.from('claude_trades').insert({
        user_id: userId,
        stock_code: code, stock_name: stock.name, trade_type: 'sell',
        date: today, price: latestPrice, quantity: openPos.quantity,
        amount: proceeds, cash_before: cash, cash_after: cash + proceeds, pnl,
        claude_reasoning: decision.reasoning,
      })
      await sb.from('claude_portfolio').update({ cash: cash + proceeds }).eq('user_id', userId)
    }

    return NextResponse.json({ ...decision, stock_code: code, stock_name: stock.name, latest_price: latestPrice })
  } catch (e: any) {
    console.error('[claude-analyze]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

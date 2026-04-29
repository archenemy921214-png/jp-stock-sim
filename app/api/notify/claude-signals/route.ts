import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { getDb, parseReasons } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type Decision = {
  code: string; name: string
  decision: 'buy' | 'sell'
  confidence: number; quantity: number
  reasoning: string; price: number; executed: boolean
}

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const sb = getDb()
  const { data: stocks } = await sb.from('stocks').select('*')
  if (!stocks || stocks.length === 0) return NextResponse.json({ message: '銘柄なし' })

  const { data: settings } = await sb.from('notification_settings').select('*').eq('id', 1).single()
  if (!settings?.enabled) return NextResponse.json({ message: '通知が無効です' })

  const toEmail = settings.email || process.env.NOTIFY_EMAIL
  if (!toEmail) return NextResponse.json({ error: '通知先メールが設定されていません' }, { status: 500 })

  const decisions: Decision[] = []
  const today = new Date().toISOString().split('T')[0]

  for (const stock of stocks) {
    try {
      const [pricesRes, latestIndRes, latestSignalRes, portfolioRes, openPosRes] = await Promise.all([
        sb.from('price_history').select('*').eq('stock_code', stock.code).order('date', { ascending: false }).limit(30),
        sb.from('indicators').select('*').eq('stock_code', stock.code).order('date', { ascending: false }).limit(1).single(),
        sb.from('signals').select('*').eq('stock_code', stock.code).eq('signal_type', 'buy').order('date', { ascending: false }).limit(1).single(),
        sb.from('claude_portfolio').select('*').eq('id', 1).single(),
        sb.from('claude_positions').select('*').eq('stock_code', stock.code).eq('status', 'open').limit(1).single(),
      ])

      const prices = pricesRes.data ?? []
      if (prices.length < 5) continue

      const latestInd = latestIndRes.data
      const latestSignal = latestSignalRes.data
      const portfolio = portfolioRes.data
      const openPos = openPosRes.data

      const cash = Number(portfolio?.cash ?? 1000000)
      const latestPrice = prices[0] ? Number(prices[0].close) : 0
      if (latestPrice === 0) continue

      const priceTable = [...prices].reverse()
        .map(p => `${p.date}: 終値¥${Number(p.close).toLocaleString()} 出来高${Number(p.volume).toLocaleString()}`)
        .join('\n')

      const signalReasons = latestSignal ? parseReasons(latestSignal.reasons) : []
      const maxInvestment = Math.floor(cash * 0.2)
      const maxQuantity = Math.floor(maxInvestment / latestPrice / 100) * 100
      const suggestedQty = Math.max(100, Math.min(maxQuantity, 1000))

      const prompt = `あなたは日本株の投資判断を行うAIトレーダーです。以下のデータを分析して、投資判断を行ってください。

【銘柄情報】
銘柄コード: ${stock.code}
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

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue

      const result = JSON.parse(jsonMatch[0]) as {
        decision: 'buy' | 'sell' | 'hold'; confidence: number; quantity: number; reasoning: string
      }
      if (result.decision === 'hold') continue

      let executed = false

      if (result.decision === 'buy' && result.quantity > 0 && !openPos) {
        const cost = latestPrice * result.quantity
        if (cash >= cost) {
          await sb.from('claude_positions').insert({
            stock_code: stock.code, stock_name: stock.name,
            entry_date: today, entry_price: latestPrice,
            quantity: result.quantity, claude_reasoning: result.reasoning,
          })
          await sb.from('claude_trades').insert({
            stock_code: stock.code, stock_name: stock.name, trade_type: 'buy',
            date: today, price: latestPrice, quantity: result.quantity,
            amount: -cost, cash_before: cash, cash_after: cash - cost,
            claude_reasoning: result.reasoning,
          })
          await sb.from('claude_portfolio').update({ cash: cash - cost }).eq('id', 1)
          executed = true
        }
      } else if (result.decision === 'sell' && openPos) {
        const proceeds = latestPrice * openPos.quantity
        const pnl = (latestPrice - Number(openPos.entry_price)) * openPos.quantity
        await sb.from('claude_positions').update({ status: 'closed' }).eq('id', openPos.id)
        await sb.from('claude_trades').insert({
          stock_code: stock.code, stock_name: stock.name, trade_type: 'sell',
          date: today, price: latestPrice, quantity: openPos.quantity,
          amount: proceeds, cash_before: cash, cash_after: cash + proceeds, pnl,
          claude_reasoning: result.reasoning,
        })
        await sb.from('claude_portfolio').update({ cash: cash + proceeds }).eq('id', 1)
        executed = true
      }

      if (executed || result.confidence >= 60) {
        decisions.push({
          code: stock.code, name: stock.name,
          decision: result.decision as 'buy' | 'sell',
          confidence: result.confidence, quantity: result.quantity,
          reasoning: result.reasoning, price: latestPrice, executed,
        })
      }
    } catch (e) {
      console.error(`[claude-signals] ${stock.code}`, e)
    }
  }

  if (decisions.length === 0) {
    return NextResponse.json({ message: 'Claude判断: 全銘柄HOLD（通知なし）', checked: stocks.length })
  }

  const dateLabel = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const buys = decisions.filter(d => d.decision === 'buy')
  const sells = decisions.filter(d => d.decision === 'sell')

  const html = `
    <h2>🤖 Claude AI 投資判断通知 — ${dateLabel}</h2>
    ${buys.length > 0 ? `
      <h3 style="color:#22c55e;">📈 買い判断 (${buys.length}銘柄)</h3>
      ${buys.map(d => `<div style="margin:12px 0;padding:12px;border:1px solid #22c55e;border-radius:8px;">
        <strong>${d.name}（${d.code}）</strong>
        <span style="margin-left:8px;color:#94a3b8;">¥${d.price.toLocaleString()} × ${d.quantity}株</span>
        <span style="margin-left:8px;color:#22c55e;">確信度 ${d.confidence}%</span>
        ${d.executed ? '<span style="margin-left:8px;font-size:12px;color:#6366f1;">✓ 執行済み</span>' : ''}
        <p style="margin:8px 0 0;color:#475569;font-size:14px;">${d.reasoning}</p>
      </div>`).join('')}
    ` : ''}
    ${sells.length > 0 ? `
      <h3 style="color:#ef4444;">📉 売り判断 (${sells.length}銘柄)</h3>
      ${sells.map(d => `<div style="margin:12px 0;padding:12px;border:1px solid #ef4444;border-radius:8px;">
        <strong>${d.name}（${d.code}）</strong>
        <span style="margin-left:8px;color:#94a3b8;">¥${d.price.toLocaleString()} × ${d.quantity}株</span>
        <span style="margin-left:8px;color:#ef4444;">確信度 ${d.confidence}%</span>
        ${d.executed ? '<span style="margin-left:8px;font-size:12px;color:#6366f1;">✓ 執行済み</span>' : ''}
        <p style="margin:8px 0 0;color:#475569;font-size:14px;">${d.reasoning}</p>
      </div>`).join('')}
    ` : ''}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">JP株シミュレーター — Claude AI より</p>
  `

  const subject = [buys.length > 0 ? `買い${buys.length}` : '', sells.length > 0 ? `売り${sells.length}` : ''].filter(Boolean).join(' / ')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: 'JP株シミュレーター <onboarding@resend.dev>',
    to: toEmail,
    subject: `🤖 Claude判断: ${subject}銘柄 — ${dateLabel}`,
    html,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sent: true, buys: buys.length, sells: sells.length, checked: stocks.length })
}

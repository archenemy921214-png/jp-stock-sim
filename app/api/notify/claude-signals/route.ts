import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { getDb, parseReasons } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const resend = new Resend(process.env.RESEND_API_KEY)

type Decision = {
  code: string
  name: string
  decision: 'buy' | 'sell'
  confidence: number
  quantity: number
  reasoning: string
  price: number
  executed: boolean
}

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 })
  }

  const db = getDb()
  const stocks = db.prepare('SELECT * FROM stocks').all() as { code: string; name: string }[]

  if (stocks.length === 0) {
    return NextResponse.json({ message: '銘柄なし' })
  }

  const settings = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() as
    | { email: string; enabled: number } | undefined

  if (!settings?.enabled) {
    return NextResponse.json({ message: '通知が無効です' })
  }

  const toEmail = settings.email || process.env.NOTIFY_EMAIL
  if (!toEmail) {
    return NextResponse.json({ error: '通知先メールが設定されていません' }, { status: 500 })
  }

  const decisions: Decision[] = []
  const today = new Date().toISOString().split('T')[0]

  for (const stock of stocks) {
    try {
      const prices = db.prepare(
        'SELECT * FROM price_history WHERE stock_code = ? ORDER BY date DESC LIMIT 30'
      ).all(stock.code) as any[]

      const latestInd = db.prepare(
        'SELECT * FROM indicators WHERE stock_code = ? ORDER BY date DESC LIMIT 1'
      ).get(stock.code) as any

      const latestSignal = db.prepare(
        "SELECT * FROM signals WHERE stock_code = ? AND signal_type = 'buy' ORDER BY date DESC LIMIT 1"
      ).get(stock.code) as any

      if (prices.length < 5) continue

      const portfolio = db.prepare('SELECT * FROM claude_portfolio WHERE id = 1').get() as any
      const openPos = db.prepare(
        "SELECT * FROM claude_positions WHERE stock_code = ? AND status = 'open' LIMIT 1"
      ).get(stock.code) as any

      const cash = portfolio?.cash ?? 1000000
      const latestPrice = prices[0]?.close ?? 0
      if (latestPrice === 0) continue

      const priceTable = [...prices].reverse()
        .map(p => `${p.date}: 終値¥${p.close.toLocaleString()} 出来高${p.volume.toLocaleString()}`)
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
5日移動平均: ${latestInd?.ma5 ? `¥${Math.round(latestInd.ma5).toLocaleString()}` : 'N/A'}
25日移動平均: ${latestInd?.ma25 ? `¥${Math.round(latestInd.ma25).toLocaleString()}` : 'N/A'}
75日移動平均: ${latestInd?.ma75 ? `¥${Math.round(latestInd.ma75).toLocaleString()}` : 'N/A'}
5日出来高平均: ${latestInd?.vol5avg ? Math.round(latestInd.vol5avg).toLocaleString() : 'N/A'}
直近20日高値: ${latestInd?.high20 ? `¥${Math.round(latestInd.high20).toLocaleString()}` : 'N/A'}

【ルールベースシグナル】
スコア: ${latestSignal?.score ?? 0}/100点（80点以上が買いシグナル）
判定根拠:
${signalReasons.length > 0 ? signalReasons.map(r => `- ${r}`).join('\n') : '- データなし'}

【現在のポートフォリオ状況】
保有現金: ¥${cash.toLocaleString()}
この銘柄の保有: ${openPos ? `${openPos.quantity}株（取得価格¥${openPos.entry_price.toLocaleString()}、含み損益: ${((latestPrice - openPos.entry_price) / openPos.entry_price * 100).toFixed(2)}%）` : 'なし'}

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
        decision: 'buy' | 'sell' | 'hold'
        confidence: number
        quantity: number
        reasoning: string
      }

      if (result.decision === 'hold') continue

      let executed = false

      if (result.decision === 'buy' && result.quantity > 0 && !openPos) {
        const cost = latestPrice * result.quantity
        if (cash >= cost) {
          db.transaction(() => {
            db.prepare(
              'INSERT INTO claude_positions (stock_code, stock_name, entry_date, entry_price, quantity, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(stock.code, stock.name, today, latestPrice, result.quantity, result.reasoning)

            db.prepare(
              'INSERT INTO claude_trades (stock_code, stock_name, trade_type, date, price, quantity, amount, cash_before, cash_after, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(stock.code, stock.name, 'buy', today, latestPrice, result.quantity, -cost, cash, cash - cost, result.reasoning)

            db.prepare(
              "UPDATE claude_portfolio SET cash = ?, updated_at = datetime('now') WHERE id = 1"
            ).run(cash - cost)
          })()
          executed = true
        }
      } else if (result.decision === 'sell' && openPos) {
        const proceeds = latestPrice * openPos.quantity
        const pnl = (latestPrice - openPos.entry_price) * openPos.quantity

        db.transaction(() => {
          db.prepare("UPDATE claude_positions SET status = 'closed' WHERE id = ?").run(openPos.id)

          db.prepare(
            'INSERT INTO claude_trades (stock_code, stock_name, trade_type, date, price, quantity, amount, cash_before, cash_after, pnl, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(stock.code, stock.name, 'sell', today, latestPrice, openPos.quantity, proceeds, cash, cash + proceeds, pnl, result.reasoning)

          db.prepare(
            "UPDATE claude_portfolio SET cash = ?, updated_at = datetime('now') WHERE id = 1"
          ).run(cash + proceeds)
        })()
        executed = true
      }

      if (executed || result.confidence >= 60) {
        decisions.push({
          code: stock.code,
          name: stock.name,
          decision: result.decision as 'buy' | 'sell',
          confidence: result.confidence,
          quantity: result.quantity,
          reasoning: result.reasoning,
          price: latestPrice,
          executed,
        })
      }
    } catch (e) {
      console.error(`[claude-signals] ${stock.code}`, e)
      continue
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
    <p>Claude が以下の投資判断を行いました。</p>

    ${buys.length > 0 ? `
      <h3 style="color:#22c55e;">📈 買い判断 (${buys.length}銘柄)</h3>
      ${buys.map(d => `
        <div style="margin:12px 0;padding:12px;border:1px solid #22c55e;border-radius:8px;">
          <strong>${d.name}（${d.code}）</strong>
          <span style="margin-left:8px;color:#94a3b8;">¥${d.price.toLocaleString()} × ${d.quantity}株</span>
          <span style="margin-left:8px;color:#22c55e;">確信度 ${d.confidence}%</span>
          ${d.executed ? '<span style="margin-left:8px;color:#6366f1;font-size:12px;">✓ 注文執行済み</span>' : ''}
          <p style="margin:8px 0 0;color:#475569;font-size:14px;">${d.reasoning}</p>
        </div>
      `).join('')}
    ` : ''}

    ${sells.length > 0 ? `
      <h3 style="color:#ef4444;">📉 売り判断 (${sells.length}銘柄)</h3>
      ${sells.map(d => `
        <div style="margin:12px 0;padding:12px;border:1px solid #ef4444;border-radius:8px;">
          <strong>${d.name}（${d.code}）</strong>
          <span style="margin-left:8px;color:#94a3b8;">¥${d.price.toLocaleString()} × ${d.quantity}株</span>
          <span style="margin-left:8px;color:#ef4444;">確信度 ${d.confidence}%</span>
          ${d.executed ? '<span style="margin-left:8px;color:#6366f1;font-size:12px;">✓ 注文執行済み</span>' : ''}
          <p style="margin:8px 0 0;color:#475569;font-size:14px;">${d.reasoning}</p>
        </div>
      `).join('')}
    ` : ''}

    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">JP株シミュレーター — Claude AI より</p>
  `

  const subject = [
    buys.length > 0 ? `買い${buys.length}` : '',
    sells.length > 0 ? `売り${sells.length}` : '',
  ].filter(Boolean).join(' / ') + `銘柄 — ${dateLabel}`

  const { error } = await resend.emails.send({
    from: 'JP株シミュレーター <onboarding@resend.dev>',
    to: toEmail,
    subject: `🤖 Claude判断: ${subject}`,
    html,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    sent: true,
    buys: buys.length,
    sells: sells.length,
    checked: stocks.length,
  })
}

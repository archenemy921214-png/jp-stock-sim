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

  const db = getDb()

  const stock = db.prepare('SELECT * FROM stocks WHERE code = ?').get(code) as any
  if (!stock) return NextResponse.json({ error: '銘柄が見つかりません' }, { status: 404 })

  // 直近30日の価格データ
  const prices = db.prepare(
    'SELECT * FROM price_history WHERE stock_code = ? ORDER BY date DESC LIMIT 30'
  ).all(code) as any[]

  // 最新の指標
  const latestInd = db.prepare(
    'SELECT * FROM indicators WHERE stock_code = ? ORDER BY date DESC LIMIT 1'
  ).get(code) as any

  // 最新シグナル
  const latestSignal = db.prepare(
    "SELECT * FROM signals WHERE stock_code = ? AND signal_type = 'buy' ORDER BY date DESC LIMIT 1"
  ).get(code) as any

  // Claudeポートフォリオの現在状況
  const portfolio = db.prepare('SELECT * FROM claude_portfolio WHERE id = 1').get() as any
  const openPos = db.prepare(
    "SELECT * FROM claude_positions WHERE stock_code = ? AND status = 'open' LIMIT 1"
  ).get(code) as any

  const cash = portfolio?.cash ?? 1000000
  const latestPrice = prices[0]?.close ?? 0
  const priceTable = [...prices].reverse()
    .map(p => `${p.date}: 終値¥${p.close.toLocaleString()} 出来高${p.volume.toLocaleString()}`)
    .join('\n')

  const signalReasons = latestSignal ? parseReasons(latestSignal.reasons) : []

  // 1回あたりの最大投資額（ポートフォリオの20%）
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

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
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

    // ポートフォリオに反映
    const today = new Date().toISOString().split('T')[0]

    if (decision.decision === 'buy' && decision.quantity > 0 && !openPos) {
      const cost = latestPrice * decision.quantity
      if (cash >= cost) {
        db.transaction(() => {
          db.prepare(
            'INSERT INTO claude_positions (stock_code, stock_name, entry_date, entry_price, quantity, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(code, stock.name, today, latestPrice, decision.quantity, decision.reasoning)

          db.prepare(
            'INSERT INTO claude_trades (stock_code, stock_name, trade_type, date, price, quantity, amount, cash_before, cash_after, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(code, stock.name, 'buy', today, latestPrice, decision.quantity, -cost, cash, cash - cost, decision.reasoning)

          db.prepare(
            "UPDATE claude_portfolio SET cash = ?, updated_at = datetime('now') WHERE id = 1"
          ).run(cash - cost)
        })()
      } else {
        decision.reasoning = `（資金不足のため見送り）${decision.reasoning}`
        decision.decision = 'hold'
      }
    } else if (decision.decision === 'sell' && openPos) {
      const proceeds = latestPrice * openPos.quantity
      const pnl = (latestPrice - openPos.entry_price) * openPos.quantity

      db.transaction(() => {
        db.prepare("UPDATE claude_positions SET status = 'closed' WHERE id = ?").run(openPos.id)

        db.prepare(
          'INSERT INTO claude_trades (stock_code, stock_name, trade_type, date, price, quantity, amount, cash_before, cash_after, pnl, claude_reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(code, stock.name, 'sell', today, latestPrice, openPos.quantity, proceeds, cash, cash + proceeds, pnl, decision.reasoning)

        db.prepare(
          "UPDATE claude_portfolio SET cash = ?, updated_at = datetime('now') WHERE id = 1"
        ).run(cash + proceeds)
      })()
    }

    return NextResponse.json({ ...decision, stock_code: code, stock_name: stock.name, latest_price: latestPrice })
  } catch (e: any) {
    console.error('[claude-analyze]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

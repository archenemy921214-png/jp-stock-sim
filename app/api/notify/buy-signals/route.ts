import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getDb, parseReasons } from '@/lib/db'
import { calculateBuySignal } from '@/lib/signals'
import type { PriceHistory, Indicator } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const stocks = db.prepare('SELECT * FROM stocks').all() as { code: string; name: string }[]

  if (stocks.length === 0) {
    return NextResponse.json({ message: '銘柄なし' })
  }

  const candidates: { code: string; name: string; score: number; reasons: string[] }[] = []

  for (const stock of stocks) {
    const prices = db.prepare(
      'SELECT * FROM price_history WHERE stock_code = ? ORDER BY date ASC'
    ).all(stock.code) as PriceHistory[]

    const indicators = db.prepare(
      'SELECT * FROM indicators WHERE stock_code = ? ORDER BY date ASC'
    ).all(stock.code) as Indicator[]

    if (prices.length < 2 || indicators.length < 2) continue

    const lastIndex = prices.length - 1
    const result = calculateBuySignal(prices, indicators, lastIndex)

    if (result.isBuyCandidate) {
      candidates.push({ code: stock.code, name: stock.name, score: result.score, reasons: result.reasons })
    }
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

  if (candidates.length === 0) {
    return NextResponse.json({ message: '買いシグナルなし', checked: stocks.length })
  }

  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })

  const html = `
    <h2>📈 買いシグナル通知 — ${today}</h2>
    <p>${candidates.length}銘柄で買いシグナルが検出されました。</p>
    ${candidates.map(c => `
      <div style="margin: 16px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <strong>${c.name}（${c.code}）</strong>
        <span style="margin-left: 8px; color: #7c3aed;">スコア: ${c.score}/100</span>
        <ul style="margin: 8px 0; padding-left: 20px; color: #475569;">
          ${c.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
    <p style="color: #94a3b8; font-size: 12px;">JP株シミュレーター より</p>
  `

  const { error } = await resend.emails.send({
    from: 'JP株シミュレーター <onboarding@resend.dev>',
    to: toEmail,
    subject: `📈 買いシグナル ${candidates.length}銘柄 — ${today}`,
    html,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sent: true, candidates: candidates.length, checked: stocks.length })
}

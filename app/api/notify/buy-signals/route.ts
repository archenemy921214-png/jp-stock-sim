import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getDb } from '@/lib/db'
import { calculateBuySignal } from '@/lib/signals'
import type { PriceHistory, Indicator } from '@/types'

export async function GET(request: Request) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getDb()
  const resend = new Resend(process.env.RESEND_API_KEY)

  const { data: allSettings } = await sb
    .from('notification_settings')
    .select('*')
    .eq('enabled', true)
    .neq('email', '')

  if (!allSettings || allSettings.length === 0) {
    return NextResponse.json({ message: '通知設定なし' })
  }

  let totalSent = 0

  for (const settings of allSettings) {
    try {
      const { data: watchlist } = await sb
        .from('user_watchlist')
        .select('stock_code')
        .eq('user_id', settings.user_id)

      if (!watchlist || watchlist.length === 0) continue

      const codes = watchlist.map((w: any) => w.stock_code)
      const { data: stocks } = await sb.from('stocks').select('*').in('code', codes)
      if (!stocks || stocks.length === 0) continue

      const candidates: { code: string; name: string; score: number; reasons: string[] }[] = []

      for (const stock of stocks) {
        const [pricesRes, indicatorsRes] = await Promise.all([
          sb.from('price_history').select('*').eq('stock_code', stock.code).order('date', { ascending: true }),
          sb.from('indicators').select('*').eq('stock_code', stock.code).order('date', { ascending: true }),
        ])
        const prices = (pricesRes.data ?? []) as PriceHistory[]
        const indicators = (indicatorsRes.data ?? []) as Indicator[]
        if (prices.length < 2 || indicators.length < 2) continue

        const lastIndex = prices.length - 1
        const result = calculateBuySignal(prices, indicators, lastIndex)
        if (result.isBuyCandidate) {
          candidates.push({ code: stock.code, name: stock.name, score: result.score, reasons: result.reasons })
        }
      }

      if (candidates.length === 0) continue

      const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      const html = `
        <h2>📈 買いシグナル通知 — ${today}</h2>
        <p>${candidates.length}銘柄で買いシグナルが検出されました。</p>
        ${candidates.map(c => `
          <div style="margin:16px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
            <strong>${c.name}（${c.code}）</strong>
            <span style="margin-left:8px;color:#7c3aed;">スコア: ${c.score}/120</span>
            <ul style="margin:8px 0;padding-left:20px;color:#475569;">
              ${c.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
        <p style="color:#94a3b8;font-size:12px;">JP株シミュレーター より</p>
      `

      const { error } = await resend.emails.send({
        from: 'JP株シミュレーター <onboarding@resend.dev>',
        to: settings.email,
        subject: `📈 買いシグナル ${candidates.length}銘柄 — ${today}`,
        html,
      })
      if (!error) totalSent++
    } catch (e) {
      console.error('[buy-signals] user:', settings.user_id, e)
    }
  }

  return NextResponse.json({ sent: totalSent > 0, users: totalSent })
}

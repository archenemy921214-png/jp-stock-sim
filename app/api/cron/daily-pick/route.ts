import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Vercel Cron: 毎日 9:00 JST (= 00:00 UTC) に実行
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${req.headers.get('host')}`
  const res = await fetch(`${baseUrl}/api/daily-pick`, { method: 'POST' })
  const data = await res.json()

  return NextResponse.json({ ok: res.ok, data })
}

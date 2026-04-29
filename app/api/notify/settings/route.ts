import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const sb = getDb()
  const { data: settings } = await sb.from('notification_settings').select('*').eq('id', 1).single()
  return NextResponse.json(settings ?? { email: '', enabled: true })
}

export async function POST(request: Request) {
  const { email, enabled } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
  }

  const sb = getDb()
  const { error } = await sb.from('notification_settings').upsert({ id: 1, email, enabled: !!enabled })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

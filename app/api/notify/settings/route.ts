import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const sb = getDb()
    const { data: settings, error } = await sb.from('notification_settings').select('*').eq('id', 1).single()
    if (error && error.code !== 'PGRST116') throw error
    return NextResponse.json(settings ?? { email: '', enabled: true })
  } catch (e: any) {
    console.error('[GET /api/notify/settings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { email, enabled } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
    }
    const sb = getDb()
    const { error } = await sb.from('notification_settings').upsert({ id: 1, email, enabled: !!enabled })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[POST /api/notify/settings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

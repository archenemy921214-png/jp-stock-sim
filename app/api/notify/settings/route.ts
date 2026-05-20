import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserId } from '@/lib/auth'

export async function GET() {
  try {
    const userId = await getUserId()
    const sb = getDb()
    const { data: settings, error } = await sb
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return NextResponse.json(settings ?? { email: '', enabled: true })
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[GET /api/notify/settings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const { email, enabled } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
    }
    const sb = getDb()
    const { error } = await sb
      .from('notification_settings')
      .upsert({ user_id: userId, email, enabled: !!enabled }, { onConflict: 'user_id' })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[POST /api/notify/settings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const settings = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() as
    | { id: number; email: string; enabled: number }
    | undefined

  return NextResponse.json(settings ?? { email: '', enabled: 1 })
}

export async function POST(request: Request) {
  const { email, enabled } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO notification_settings (id, email, enabled) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, enabled = excluded.enabled
  `).run(email, enabled ? 1 : 0)

  return NextResponse.json({ ok: true })
}

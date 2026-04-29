import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const db = getDb()
  db.prepare('DELETE FROM stocks WHERE code = ?').run(code)
  return NextResponse.json({ success: true })
}

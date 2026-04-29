import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const sb = getDb()
  const { error } = await sb.from('stocks').delete().eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

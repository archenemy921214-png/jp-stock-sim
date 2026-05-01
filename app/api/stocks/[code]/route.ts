import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const sb = getDb()
    const { error } = await sb.from('stocks').delete().eq('code', code)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[DELETE /api/stocks/[code]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

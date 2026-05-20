import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserId } from '@/lib/auth'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const [{ code }, userId] = await Promise.all([params, getUserId()])
    const sb = getDb()
    const { error } = await sb.from('user_watchlist').delete().eq('stock_code', code).eq('user_id', userId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    if (e?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[DELETE /api/stocks/[code]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

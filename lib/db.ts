// サーバー側（API Route）専用 - service_role key 使用
import { getSupabaseAdmin } from './supabase/admin'

export function getDb() {
  return getSupabaseAdmin()
}

export function parseReasons(val: string | string[] | null | undefined): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val as string) } catch { return [] }
}

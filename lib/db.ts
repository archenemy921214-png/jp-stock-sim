import { getSupabaseAdmin } from './supabase'

export function getDb() {
  return getSupabaseAdmin()
}

export function parseReasons(val: string | string[] | null | undefined): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  try { return JSON.parse(val as string) } catch { return [] }
}

import { getSupabaseServer } from './supabase/server'

export async function getUserId(): Promise<string> {
  const sb = await getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return user.id
}

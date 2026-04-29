'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function OnboardingPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabase()
    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange>['data']['subscription'] | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const redirect = () => router.replace('/dashboard')

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        redirect()
        return
      }

      // Supabase クライアントが URL の code/hash を検出してセッションを復元するのを待つ
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          redirect()
        }
      })
      subscription = data.subscription

      // 10秒経ってもセッションが取得できなければエラー表示
      timer = setTimeout(() => setStatus('error'), 10000)
    })

    return () => {
      subscription?.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [router])

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-bold mb-2">認証に失敗しました</h2>
          <p className="text-slate-400 text-sm mb-6">
            ログインリンクの有効期限が切れているか、すでに使用済みです。
          </p>
          <a
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            ログインページへ戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">認証中...</p>
      </div>
    </div>
  )
}

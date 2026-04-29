'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
    })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = getSupabase()
    const redirectTo = `${window.location.origin}/onboarding`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-white text-xl font-bold mb-2">メールを確認してください</h2>
          <p className="text-slate-400 text-sm">
            <span className="text-blue-400 font-medium">{email}</span> にログインリンクを送信しました。
            メール内のリンクをクリックしてください。
          </p>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="mt-6 text-slate-400 text-sm hover:text-white transition-colors"
          >
            別のメールアドレスで試す
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full">
        <h1 className="text-white text-2xl font-bold mb-2">ログイン</h1>
        <p className="text-slate-400 text-sm mb-6">
          メールアドレスにログインリンクを送信します
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm block mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg font-medium transition-colors"
          >
            {loading ? '送信中...' : 'ログインリンクを送信'}
          </button>
        </form>
      </div>
    </div>
  )
}

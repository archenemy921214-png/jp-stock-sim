'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

type Mode = 'login' | 'signup'

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'メールアドレスまたはパスワードが間違っています'
  if (msg.includes('Email not confirmed')) return 'メールの確認が完了していません。確認メールをチェックしてください'
  if (msg.includes('User already registered')) return 'このメールアドレスは既に登録されています'
  if (msg.includes('Password should be')) return 'パスワードは6文字以上で入力してください'
  if (msg.includes('rate limit')) return 'しばらく時間をおいてから再試行してください'
  return msg
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupDone, setSignupDone] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // コールバック失敗時のエラー表示（Suspense不要なwindow.location経由で取得）
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'auth_failed') {
      setError('認証リンクが無効か期限切れです。再度お試しください。')
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [router])

  // bfcache（戻るキャッシュ）から復元されたとき loading をリセット
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword('')
    setPasswordConfirm('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('パスワードは6文字以上で入力してください')
        return
      }
      if (password !== passwordConfirm) {
        setError('パスワードが一致しません')
        return
      }
    }

    setLoading(true)
    let navigating = false
    try {
      if (mode === 'signup') {
        // サインアップは直接Supabaseクライアントを使用
        const supabase = getSupabase()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
        })
        if (error) {
          setError(translateError(error.message))
        } else if (data.session) {
          navigating = true
          window.location.href = '/'
        } else {
          setSignupDone(true)
        }
      } else {
        // ログインはサーバーAPIルート経由（iOS Safari クロスオリジン問題を回避）
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const result = await res.json()
        if (!res.ok) {
          setError(translateError(result.error ?? 'ログインに失敗しました'))
        } else {
          navigating = true
          window.location.href = '/'
        }
      }
    } catch (e: any) {
      setError(`エラー: ${e.message ?? '不明なエラーが発生しました'}`)
    } finally {
      if (!navigating) setLoading(false)
    }
  }

  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-white text-xl font-bold mb-2">確認メールを送信しました</h2>
          <p className="text-slate-400 text-sm mb-6">
            <span className="text-blue-400 font-medium">{email}</span> に確認メールを送りました。
            メール内のリンクをクリックして登録を完了してください。
          </p>
          <button
            onClick={() => { setSignupDone(false); switchMode('login') }}
            className="text-blue-400 text-sm hover:text-blue-300 transition-colors"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full">

        {/* ロゴ */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">📈</div>
          <h1 className="text-white text-xl font-bold">JP株トレード</h1>
          <p className="text-slate-400 text-xs mt-1">日本株シミュレーター</p>
        </div>

        {/* タブ */}
        <div className="flex bg-slate-700 rounded-lg p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm block mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm block mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '6文字以上' : 'パスワード'}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="text-slate-300 text-sm block mb-1">パスワード（確認）</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="もう一度入力"
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
          </button>
        </form>

        {mode === 'login' && (
          <p className="text-center text-slate-500 text-xs mt-4">
            アカウントをお持ちでない方は
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="text-blue-400 hover:text-blue-300 ml-1 transition-colors"
            >
              新規登録
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

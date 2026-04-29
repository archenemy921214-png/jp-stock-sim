'use client'

import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [email, setEmail] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/notify/settings')
      .then(r => r.json())
      .then(d => {
        setEmail(d.email ?? '')
        setEnabled(d.enabled === 1)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/notify/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, enabled }),
    })
    setSaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: '設定を保存しました' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error ?? '保存に失敗しました' })
    }
  }

  async function handleTest() {
    setTesting(true)
    setMessage(null)
    const secret = prompt('CRON_SECRET を入力してください')
    if (!secret) { setTesting(false); return }
    const res = await fetch('/api/notify/claude-signals', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const d = await res.json()
    setTesting(false)
    if (res.ok) {
      setMessage({ type: 'success', text: d.message ?? `買い${d.buys ?? 0}・売り${d.sells ?? 0}銘柄（${d.checked}銘柄チェック済み）` })
    } else {
      setMessage({ type: 'error', text: d.error ?? 'エラーが発生しました' })
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">通知設定</h1>

      <div className="bg-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">Claude AI 通知</p>
            <p className="text-slate-400 text-sm mt-0.5">平日毎朝9時にAIが全銘柄を分析・通知</p>
          </div>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-slate-300 text-sm">通知先メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {testing ? 'チェック中...' : '今すぐシグナルチェック'}
          </button>
        </div>
      </div>
    </div>
  )
}

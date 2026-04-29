'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
  onAdded: () => void
}

const POPULAR_STOCKS = [
  { code: '7203', name: 'トヨタ自動車' },
  { code: '6758', name: 'ソニーグループ' },
  { code: '9984', name: 'ソフトバンクG' },
  { code: '7974', name: '任天堂' },
  { code: '9983', name: 'ファストリ' },
  { code: '8306', name: '三菱UFJ' },
  { code: '6861', name: 'キーエンス' },
  { code: '4063', name: '信越化学' }
]

export default function AddStockModal({ onClose, onAdded }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ code: string; name: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const isCode = /^\d{1,4}$/.test(query)
    if (!query || isCode) {
      setResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  const handleSubmit = async (stockCode: string) => {
    setLoading(true)
    setError('')
    try {
      const addRes = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: stockCode })
      })
      const addData = await addRes.json()
      if (!addRes.ok) throw new Error(addData.error)

      await fetch(`/api/stocks/${stockCode}/refresh`, { method: 'POST' })
      onAdded()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isDirectCode = /^\d{4}$/.test(query)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">銘柄を追加</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="text-slate-300 text-sm block mb-1">銘柄コード（4桁）または銘柄名</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="例: 7203 / トヨタ / toyota"
                className="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && isDirectCode && handleSubmit(query)}
              />
              {isDirectCode && (
                <button
                  onClick={() => handleSubmit(query)}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? '処理中...' : '追加'}
                </button>
              )}
            </div>
          </div>

          {searching && (
            <p className="text-slate-400 text-sm">検索中...</p>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              <p className="text-slate-400 text-xs">検索結果</p>
              {results.map(r => (
                <button
                  key={r.code}
                  onClick={() => handleSubmit(r.code)}
                  disabled={loading}
                  className="w-full flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg px-3 py-2 text-sm transition-colors text-left"
                >
                  <span className="text-blue-400 font-mono font-bold w-12 shrink-0">{r.code}</span>
                  <span className="text-slate-300 truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div>
              <p className="text-slate-400 text-xs mb-2">人気銘柄</p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_STOCKS.map(s => (
                  <button
                    key={s.code}
                    onClick={() => handleSubmit(s.code)}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg px-3 py-2 text-sm transition-colors text-left"
                  >
                    <span className="text-blue-400 font-mono font-bold">{s.code}</span>
                    <span className="text-slate-300 truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

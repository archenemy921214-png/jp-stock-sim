'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (code: string) => void
  className?: string
}

export default function StockCodeInput({ value, onChange, className }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<{ code: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // onChangeは ref 経由で参照 — 直接 useEffect の deps に入れない
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange // レンダーごとに更新（useEffect 不要）

  // 外クリックでドロップダウンを閉じる（一度だけ登録）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ユーザー入力ハンドラー — onChange は useEffect からではなくここから直接呼ぶ
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    // 4桁コード → 即座に親へ通知して終了
    if (/^\d{4}$/.test(val)) {
      onChangeRef.current(val)
      setResults([])
      setOpen(false)
      return
    }

    // 空 or 1〜3桁数字 → リセット
    if (!val || /^\d{1,3}$/.test(val)) {
      setResults([])
      setOpen(false)
      return
    }

    // テキスト → デバウンス検索
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(val)}`)
        if (!res.ok) { setResults([]); setOpen(false); return }
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setResults(list)
        setOpen(list.length > 0)
      } catch {
        setResults([])
        setOpen(false)
      }
    }, 300)
  }

  const select = (code: string, name: string) => {
    setQuery(`${code} ${name}`)
    onChangeRef.current(code)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="例: 7203 / トヨタ"
        className={className}
      />
      {open && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg overflow-hidden shadow-lg">
          {results.map(r => (
            <li key={r.code}>
              <button
                type="button"
                onMouseDown={() => select(r.code, r.name)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-600 text-left text-sm transition-colors"
              >
                <span className="text-blue-400 font-mono font-bold w-12 shrink-0">{r.code}</span>
                <span className="text-slate-200 truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
